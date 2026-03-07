export interface Bike {
    id: number;
    name: string;
    make?: string;
    model?: string;
    year?: number;
    color?: string;
    image_url?: string;
    is_default: number;
    owner_id: number;
}

export interface BikeCreate {
    name: string;
    make?: string;
    model?: string;
    year?: number;
    color?: string;
    image_url?: string;
    is_default?: number;
}

export interface BikeUpdate {
    name?: string;
    make?: string;
    model?: string;
    year?: number;
    color?: string;
    image_url?: string;
    is_default?: number;
}

export type BikeDocumentType = 'driving_license' | 'insurance' | 'pollution' | 'registration';

export interface BikeDocumentProfile {
    id: number;
    bike_id: number;
    registration_number?: string;
    chassis_number?: string;
    engine_number?: string;
    owner_name?: string;
    driving_license_number?: string;
    driving_license_expiry?: string;
    driving_license_pdf_url?: string;
    insurance_policy_number?: string;
    insurance_expiry?: string;
    insurance_pdf_url?: string;
    pollution_certificate_number?: string;
    pollution_expiry?: string;
    pollution_pdf_url?: string;
    registration_certificate_number?: string;
    registration_expiry?: string;
    registration_certificate_pdf_url?: string;
    notes?: string;
}

export interface BikeDocumentUpdate {
    registration_number?: string;
    chassis_number?: string;
    engine_number?: string;
    owner_name?: string;
    driving_license_number?: string;
    driving_license_expiry?: string;
    insurance_policy_number?: string;
    insurance_expiry?: string;
    pollution_certificate_number?: string;
    pollution_expiry?: string;
    registration_certificate_number?: string;
    registration_expiry?: string;
    notes?: string;
}

export interface BikeDocumentUploadResponse {
    doc_type: BikeDocumentType;
    pdf_url: string;
}
