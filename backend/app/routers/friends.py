from datetime import datetime
from typing import Dict, List, Optional, Set
import re
import math

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from .. import auth, database, models, schemas


router = APIRouter(prefix="/api/v1/friends", tags=["friends"])


def _normalize_username(raw: str) -> str:
    value = re.sub(r"[^a-zA-Z0-9_.]", "", (raw or "").strip().lower())
    return value.strip("._")


def _normalize_phone(raw: Optional[str]) -> Optional[str]:
    if not raw:
        return None
    digits = "".join(ch for ch in raw if ch.isdigit())
    return digits or None


def _friend_ids(db: Session, user_id: int) -> Set[int]:
    return {
        row.friend_id
        for row in db.query(models.Friendship.friend_id)
        .filter(models.Friendship.user_id == user_id)
        .all()
    }


def _username_for(user: models.User) -> str:
    if user.username and user.username.strip():
        return user.username.strip()
    email = (user.email or "").strip()
    if email and "@" in email:
        return email.split("@", 1)[0]
    return f"rider{user.id}"


def _to_user_summary(user: models.User, mutual_friends_count: int = 0) -> schemas.FriendUserSummary:
    return schemas.FriendUserSummary(
        id=user.id,
        username=_username_for(user),
        full_name=user.full_name,
        profile_picture_url=user.profile_picture_url,
        mutual_friends_count=mutual_friends_count,
    )


def _to_request_summary(
    db: Session,
    request: models.FriendRequest,
    viewer_friend_ids: Optional[Set[int]] = None,
) -> schemas.FriendRequestResponse:
    viewer_friend_ids = viewer_friend_ids or set()
    requester_friend_ids = _friend_ids(db, request.requester_id) if request.requester is not None else set()
    receiver_friend_ids = _friend_ids(db, request.receiver_id) if request.receiver is not None else set()
    requester_mutuals = len(viewer_friend_ids.intersection(requester_friend_ids)) if viewer_friend_ids else 0
    receiver_mutuals = len(viewer_friend_ids.intersection(receiver_friend_ids)) if viewer_friend_ids else 0
    return schemas.FriendRequestResponse(
        id=request.id,
        status=request.status,
        created_at=request.created_at,
        responded_at=request.responded_at,
        requester=_to_user_summary(request.requester, requester_mutuals),
        receiver=_to_user_summary(request.receiver, receiver_mutuals),
    )


def _are_friends(db: Session, user_a_id: int, user_b_id: int) -> bool:
    return (
        db.query(models.Friendship)
        .filter(
            models.Friendship.user_id == user_a_id,
            models.Friendship.friend_id == user_b_id,
        )
        .first()
        is not None
    )


def _ensure_mutual_friendship(db: Session, user_a_id: int, user_b_id: int) -> None:
    if user_a_id == user_b_id:
        return

    for source_id, target_id in [(user_a_id, user_b_id), (user_b_id, user_a_id)]:
        exists = (
            db.query(models.Friendship)
            .filter(
                models.Friendship.user_id == source_id,
                models.Friendship.friend_id == target_id,
            )
            .first()
        )
        if not exists:
            db.add(models.Friendship(user_id=source_id, friend_id=target_id))


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius_km = 6371.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    a = (
        math.sin(d_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    )
    return radius_km * (2 * math.atan2(math.sqrt(a), math.sqrt(1 - a)))


def _excluded_user_ids_for_recommendations(db: Session, current_user: models.User) -> Set[int]:
    excluded = {current_user.id}
    excluded.update(_friend_ids(db, current_user.id))

    pending = db.query(models.FriendRequest).filter(
        models.FriendRequest.status == "pending",
        or_(
            models.FriendRequest.requester_id == current_user.id,
            models.FriendRequest.receiver_id == current_user.id,
        ),
    ).all()

    for req in pending:
        excluded.add(req.requester_id)
        excluded.add(req.receiver_id)

    return excluded


def _build_suggested_for_you(
    db: Session,
    current_user: models.User,
    limit: int,
    additionally_excluded: Optional[Set[int]] = None,
) -> List[schemas.FriendRecommendation]:
    additionally_excluded = additionally_excluded or set()
    my_friend_ids = _friend_ids(db, current_user.id)

    excluded = _excluded_user_ids_for_recommendations(db, current_user)
    excluded.update(additionally_excluded)

    candidates = db.query(models.User).filter(~models.User.id.in_(excluded)).all()
    scored: List[tuple[models.User, int, Optional[float]]] = []

    my_lat = current_user.last_known_lat
    my_lng = current_user.last_known_lng
    use_location = my_lat is not None and my_lng is not None

    for candidate in candidates:
        candidate_friend_ids = _friend_ids(db, candidate.id)
        mutual_count = len(my_friend_ids.intersection(candidate_friend_ids))

        distance_km: Optional[float] = None
        if use_location and candidate.last_known_lat is not None and candidate.last_known_lng is not None:
            distance_km = _haversine_km(
                float(my_lat),
                float(my_lng),
                float(candidate.last_known_lat),
                float(candidate.last_known_lng),
            )

        scored.append((candidate, mutual_count, distance_km))

    scored.sort(
        key=lambda item: (
            item[1],
            -(item[2] if item[2] is not None else 99999.0),
            item[0].created_at.timestamp() if item[0].created_at else 0,
        ),
        reverse=True,
    )

    recommendations: List[schemas.FriendRecommendation] = []
    for user, mutuals, distance_km in scored[:limit]:
        if mutuals > 0:
            reason = f"Followed by {mutuals} mutual friend{'s' if mutuals != 1 else ''}"
        elif distance_km is not None and distance_km <= 10:
            reason = "Rider near your location"
        elif distance_km is not None and distance_km <= 50:
            reason = "Rider in your area"
        else:
            reason = "New rider you may know"

        recommendations.append(
            schemas.FriendRecommendation(
                user=_to_user_summary(user, mutuals),
                reason=reason,
                distance_km=round(distance_km, 1) if distance_km is not None else None,
            )
        )

    return recommendations


@router.get("/", response_model=List[schemas.FriendUserSummary])
def list_friends(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    friend_ids = list(_friend_ids(db, current_user.id))
    if not friend_ids:
        return []

    users = db.query(models.User).filter(models.User.id.in_(friend_ids)).all()
    users.sort(key=lambda u: (u.full_name or _username_for(u)).lower())

    my_friend_ids = _friend_ids(db, current_user.id)
    return [
        _to_user_summary(user, len(my_friend_ids.intersection(_friend_ids(db, user.id))))
        for user in users
    ]


@router.get("/requests/incoming", response_model=List[schemas.FriendRequestResponse])
def incoming_friend_requests(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    requests = (
        db.query(models.FriendRequest)
        .filter(
            models.FriendRequest.receiver_id == current_user.id,
            models.FriendRequest.status == "pending",
        )
        .order_by(models.FriendRequest.created_at.desc())
        .all()
    )
    my_friend_ids = _friend_ids(db, current_user.id)
    return [_to_request_summary(db, request, my_friend_ids) for request in requests]


@router.get("/requests/outgoing", response_model=List[schemas.FriendRequestResponse])
def outgoing_friend_requests(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    requests = (
        db.query(models.FriendRequest)
        .filter(
            models.FriendRequest.requester_id == current_user.id,
            models.FriendRequest.status == "pending",
        )
        .order_by(models.FriendRequest.created_at.desc())
        .all()
    )
    my_friend_ids = _friend_ids(db, current_user.id)
    return [_to_request_summary(db, request, my_friend_ids) for request in requests]


@router.get("/discover", response_model=List[schemas.FriendUserSummary])
def discover_users(
    query: str = Query(..., min_length=2),
    limit: int = Query(20, ge=1, le=50),
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    normalized_query = query.strip().lower()
    blocked_ids = _excluded_user_ids_for_recommendations(db, current_user)

    users = (
        db.query(models.User)
        .filter(
            ~models.User.id.in_(blocked_ids),
            or_(
                models.User.username.ilike(f"%{normalized_query}%"),
                models.User.full_name.ilike(f"%{normalized_query}%"),
            ),
        )
        .order_by(models.User.created_at.desc())
        .limit(limit)
        .all()
    )

    my_friend_ids = _friend_ids(db, current_user.id)
    return [
        _to_user_summary(user, len(my_friend_ids.intersection(_friend_ids(db, user.id))))
        for user in users
    ]


@router.get("/recommendations", response_model=List[schemas.FriendRecommendation])
def suggested_friends(
    limit: int = Query(20, ge=1, le=50),
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    return _build_suggested_for_you(db, current_user, limit)


@router.post("/recommendations/contacts", response_model=schemas.FriendContactRecommendationResponse)
def recommended_from_contacts(
    payload: schemas.FriendContactRecommendationRequest,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    limit = max(1, min(int(payload.limit or 20), 50))
    excluded_ids = _excluded_user_ids_for_recommendations(db, current_user)

    phone_to_name: Dict[str, str] = {}
    emails: Set[str] = set()
    usernames: Set[str] = set()

    for contact in payload.contacts or []:
        phone = _normalize_phone(contact.phone_number)
        if phone:
            phone_to_name[phone] = (contact.name or "").strip()

        if contact.email:
            emails.add(contact.email.strip().lower())

        if contact.username:
            normalized_username = _normalize_username(contact.username)
            if normalized_username:
                usernames.add(normalized_username)

    conditions = []
    if phone_to_name:
        conditions.append(models.User.phone_number.in_(list(phone_to_name.keys())))
    if emails:
        conditions.append(models.User.email.in_(list(emails)))
    if usernames:
        conditions.append(models.User.username.in_(list(usernames)))

    from_contacts: List[schemas.FriendRecommendation] = []
    matched_ids: Set[int] = set()
    my_friend_ids = _friend_ids(db, current_user.id)

    if conditions:
        matched_users = (
            db.query(models.User)
            .filter(or_(*conditions), ~models.User.id.in_(excluded_ids))
            .all()
        )

        for user in matched_users:
            phone = _normalize_phone(user.phone_number)
            contact_name = phone_to_name.get(phone or "") if phone else None
            mutual_count = len(my_friend_ids.intersection(_friend_ids(db, user.id)))

            if user.username and user.username in usernames:
                reason = "Username found in your contacts"
            elif phone and phone in phone_to_name:
                reason = "Phone number found in your contacts"
            elif user.email and user.email.lower() in emails:
                reason = "Email found in your contacts"
            else:
                reason = "Found in your contacts"

            from_contacts.append(
                schemas.FriendRecommendation(
                    user=_to_user_summary(user, mutual_count),
                    reason=reason,
                    from_contact_name=contact_name or None,
                )
            )
            matched_ids.add(user.id)

        from_contacts.sort(
            key=lambda item: (
                item.user.mutual_friends_count or 0,
                1 if item.from_contact_name else 0,
            ),
            reverse=True,
        )
        from_contacts = from_contacts[:limit]

    suggested_for_you = _build_suggested_for_you(
        db,
        current_user,
        limit=max(0, limit - len(from_contacts)),
        additionally_excluded=matched_ids,
    )

    return schemas.FriendContactRecommendationResponse(
        from_contacts=from_contacts,
        suggested_for_you=suggested_for_you,
    )


@router.post("/requests", response_model=schemas.FriendRequestResponse, status_code=status.HTTP_201_CREATED)
def send_friend_request(
    payload: schemas.FriendRequestCreate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    target_username = _normalize_username(payload.target_username or "")
    target_email = (payload.target_email or "").strip().lower()

    if not target_username and not target_email:
        raise HTTPException(status_code=400, detail="target_username is required")

    target_user = None
    if target_username:
        target_user = db.query(models.User).filter(models.User.username == target_username).first()
    elif target_email:
        # Backward compatible fallback
        target_user = db.query(models.User).filter(models.User.email == target_email).first()

    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    if target_user.id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot add yourself")
    if _are_friends(db, current_user.id, target_user.id):
        raise HTTPException(status_code=409, detail="You are already friends")

    inverse_pending = (
        db.query(models.FriendRequest)
        .filter(
            models.FriendRequest.requester_id == target_user.id,
            models.FriendRequest.receiver_id == current_user.id,
            models.FriendRequest.status == "pending",
        )
        .first()
    )
    if inverse_pending:
        inverse_pending.status = "accepted"
        inverse_pending.responded_at = datetime.utcnow()
        _ensure_mutual_friendship(db, current_user.id, target_user.id)
        db.commit()
        db.refresh(inverse_pending)
        return _to_request_summary(db, inverse_pending, _friend_ids(db, current_user.id))

    existing = (
        db.query(models.FriendRequest)
        .filter(
            models.FriendRequest.requester_id == current_user.id,
            models.FriendRequest.receiver_id == target_user.id,
        )
        .first()
    )

    if existing and existing.status == "pending":
        raise HTTPException(status_code=409, detail="Friend request already sent")

    if existing:
        existing.status = "pending"
        existing.created_at = datetime.utcnow()
        existing.responded_at = None
        request = existing
    else:
        request = models.FriendRequest(
            requester_id=current_user.id,
            receiver_id=target_user.id,
            status="pending",
        )
        db.add(request)

    db.commit()
    db.refresh(request)
    return _to_request_summary(db, request, _friend_ids(db, current_user.id))


@router.post("/requests/{request_id}/accept", response_model=schemas.FriendRequestResponse)
def accept_friend_request(
    request_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    request = (
        db.query(models.FriendRequest)
        .filter(
            models.FriendRequest.id == request_id,
            models.FriendRequest.receiver_id == current_user.id,
        )
        .first()
    )
    if not request:
        raise HTTPException(status_code=404, detail="Friend request not found")
    if request.status != "pending":
        raise HTTPException(status_code=400, detail="Friend request is not pending")

    request.status = "accepted"
    request.responded_at = datetime.utcnow()
    _ensure_mutual_friendship(db, request.requester_id, request.receiver_id)

    db.commit()
    db.refresh(request)
    return _to_request_summary(db, request, _friend_ids(db, current_user.id))


@router.post("/requests/{request_id}/decline", response_model=schemas.FriendRequestResponse)
def decline_friend_request(
    request_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    request = (
        db.query(models.FriendRequest)
        .filter(
            models.FriendRequest.id == request_id,
            models.FriendRequest.receiver_id == current_user.id,
        )
        .first()
    )
    if not request:
        raise HTTPException(status_code=404, detail="Friend request not found")
    if request.status != "pending":
        raise HTTPException(status_code=400, detail="Friend request is not pending")

    request.status = "declined"
    request.responded_at = datetime.utcnow()
    db.commit()
    db.refresh(request)
    return _to_request_summary(db, request, _friend_ids(db, current_user.id))


@router.delete("/{friend_user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_friend(
    friend_user_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    if friend_user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot remove yourself")

    db.query(models.Friendship).filter(
        models.Friendship.user_id == current_user.id,
        models.Friendship.friend_id == friend_user_id,
    ).delete(synchronize_session=False)

    db.query(models.Friendship).filter(
        models.Friendship.user_id == friend_user_id,
        models.Friendship.friend_id == current_user.id,
    ).delete(synchronize_session=False)

    db.query(models.FriendRequest).filter(
        or_(
            (
                (models.FriendRequest.requester_id == current_user.id)
                & (models.FriendRequest.receiver_id == friend_user_id)
            ),
            (
                (models.FriendRequest.requester_id == friend_user_id)
                & (models.FriendRequest.receiver_id == current_user.id)
            ),
        )
    ).update(
        {
            models.FriendRequest.status: "cancelled",
            models.FriendRequest.responded_at: datetime.utcnow(),
        },
        synchronize_session=False,
    )

    db.commit()
    return None
