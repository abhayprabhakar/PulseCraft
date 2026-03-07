import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Plus, Bike, Check, Edit2, Trash2 } from 'lucide-react';
import { bikesApi } from '../services/api';
import { BikeCreate } from '../types/bike';

const BikeSelectionPage: React.FC = () => {
    const { bikes, selectBike, refreshBikes, currentBike } = useAuth();
    const navigate = useNavigate();
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editingBikeId, setEditingBikeId] = useState<number | null>(null);

    // Form state
    const [formData, setFormData] = useState<BikeCreate>({
        name: '',
        make: '',
        model: ''
    });

    useEffect(() => {
        refreshBikes();
    }, []);

    const handleSelect = (bike: any) => {
        selectBike(bike);
        navigate('/dashboard');
    };

    const getAvatarUrl = (url?: string) => {
        if (!url) return null;
        // Use localStorage URL if available, fallback to env
        const baseUrl = localStorage.getItem('api_url') || import.meta.env.VITE_API_URL || 'http://localhost:8000';
        // Remove /api/v1 suffix if present, as static files are served from root
        const cleanBaseUrl = baseUrl.replace('/api/v1', '');
        return url.startsWith('http') ? url : `${cleanBaseUrl}${url}`;
    };

    const openAddModal = () => {
        setIsEditing(false);
        setEditingBikeId(null);
        setFormData({ name: '', make: '', model: '' });
        setSelectedFile(null);
        setIsModalOpen(true);
    };

    const openEditModal = (e: React.MouseEvent, bike: any) => {
        e.stopPropagation(); // Prevent card selection
        setIsEditing(true);
        setEditingBikeId(bike.id);
        setFormData({
            name: bike.name,
            make: bike.make || '',
            model: bike.model || ''
        });
        setSelectedFile(null);
        setIsModalOpen(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            let bikeId;

            if (isEditing && editingBikeId) {
                // Update existing bike
                const updatedBike = await bikesApi.update(editingBikeId, formData);
                bikeId = updatedBike.id;
            } else {
                // Create new bike
                const createdBike = await bikesApi.create(formData);
                bikeId = createdBike.id;
            }

            // Upload image if selected
            if (selectedFile && bikeId) {
                await bikesApi.uploadImage(bikeId, selectedFile);
            }

            await refreshBikes();
            setIsModalOpen(false);
            setFormData({ name: '', make: '', model: '' });
            setSelectedFile(null);
        } catch (error) {
            console.error("Failed to save bike", error);
            alert("Failed to save bike details");
        }
    };

    const handleDelete = async (e: React.MouseEvent, bikeId: number, bikeName: string) => {
        e.stopPropagation(); // Prevent card selection

        if (!confirm(`Are you sure you want to delete "${bikeName}"? This action cannot be undone.`)) {
            return;
        }

        try {
            await bikesApi.delete(bikeId);
            await refreshBikes();

            // If deleted bike was selected, clear selection
            if (currentBike?.id === bikeId) {
                selectBike(null);
            }
        } catch (error) {
            console.error("Failed to delete bike", error);
            alert("Failed to delete bike");
        }
    };

    return (
        <div className="bike-selection-page">
            <div className="profile-container">
                <h1>Select Your Ride</h1>

                <div className="bikes-grid">
                    {bikes.map(bike => (
                        <div key={bike.id} className="bike-card" onClick={() => handleSelect(bike)}>
                            <div className="bike-avatar" style={{
                                backgroundColor: '#222', // Neutral background for PNGs
                                borderColor: currentBike?.id === bike.id ? 'var(--accent-primary)' : 'transparent',
                                overflow: 'hidden',
                                position: 'relative'
                            }}>
                                {bike.image_url ? (
                                    <img src={getAvatarUrl(bike.image_url)!} alt={bike.name} style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '10px' }} />
                                ) : (
                                    <Bike size={48} style={{ color: bike.color || '#666' }} />
                                )}

                                <button
                                    className="delete-btn"
                                    onClick={(e) => handleDelete(e, bike.id, bike.name)}
                                    title="Delete Bike"
                                >
                                    <Trash2 size={14} />
                                </button>

                                <button
                                    className="edit-btn"
                                    onClick={(e) => openEditModal(e, bike)}
                                    title="Edit Bike"
                                >
                                    <Edit2 size={14} />
                                </button>
                            </div>
                            <span className="bike-name">{bike.name}</span>
                            {currentBike?.id === bike.id && <span className="current-badge"><Check size={12} /> Current</span>}
                        </div>
                    ))}

                    <div className="bike-card add-card" onClick={openAddModal}>
                        <div className="bike-avatar add-avatar">
                            <Plus size={48} />
                        </div>
                        <span className="bike-name">Add Bike</span>
                    </div>
                </div>

                {isModalOpen && (
                    <div className="modal-overlay">
                        <div className="modal-content">
                            <h2>{isEditing ? 'Edit Bike' : 'Add New Bike'}</h2>
                            <form onSubmit={handleSubmit}>
                                <div className="form-group">
                                    <label>Bike Image</label>
                                    <div className="file-upload-wrapper">
                                        <button
                                            type="button"
                                            className="file-select-btn"
                                            onClick={() => document.getElementById('bike-image-upload')?.click()}
                                        >
                                            {isEditing ? 'Change Image' : 'Choose Image'}
                                        </button>
                                        <span className="selected-file-name">
                                            {selectedFile ? selectedFile.name : 'No file chosen'}
                                        </span>
                                        <input
                                            id="bike-image-upload"
                                            type="file"
                                            accept="image/*"
                                            onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                                            style={{ display: 'none' }}
                                        />
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label>Nickname</label>
                                    <input
                                        type="text"
                                        value={formData.name}
                                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                                        placeholder="e.g. The Beast"
                                        required
                                        autoFocus
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Make</label>
                                    <input
                                        type="text"
                                        value={formData.make || ''}
                                        onChange={e => setFormData({ ...formData, make: e.target.value })}
                                        placeholder="e.g. Yamaha"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Model</label>
                                    <input
                                        type="text"
                                        value={formData.model || ''}
                                        onChange={e => setFormData({ ...formData, model: e.target.value })}
                                        placeholder="e.g. R1"
                                    />
                                </div>
                                <div className="form-actions">
                                    <button type="button" onClick={() => setIsModalOpen(false)} className="btn-cancel">Cancel</button>
                                    <button type="submit" className="btn-save">
                                        {isEditing ? 'Save Changes' : 'Add Bike'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </div>

            <style>{`
                .bike-selection-page {
                    min-height: 100vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: #1a1a1a;
                    color: white;
                    font-family: 'Inter', sans-serif;
                }
                .profile-container {
                    text-align: center;
                    animation: fadeIn 0.5s ease;
                }
                h1 {
                    font-size: 3rem;
                    margin-bottom: 3rem;
                    font-weight: 500;
                    font-family: 'Orbitron', sans-serif;
                    letter-spacing: 2px;
                }
                .bikes-grid {
                    display: flex;
                    gap: 2rem;
                    flex-wrap: wrap;
                    justify-content: center;
                }
                .bike-card {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 1rem;
                    cursor: pointer;
                    transition: transform 0.2s, opacity 0.2s;
                    position: relative;
                }
                .bike-card:hover {
                    transform: scale(1.05);
                }
                .bike-card:hover .bike-avatar {
                    border: 3px solid white;
                }
                .bike-avatar {
                    width: 150px;
                    height: 150px;
                    border-radius: 12px;
                    background: #333;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border: 3px solid transparent;
                    transition: border-color 0.2s;
                }
                .add-avatar {
                    background: #222;
                    border: 2px dashed #666;
                }
                .bike-name {
                    font-size: 1.2rem;
                    color: #999;
                    transition: color 0.2s;
                    font-family: 'Rajdhani', sans-serif;
                    font-weight: 600;
                }
                .bike-card:hover .bike-name {
                    color: white;
                }
                
                /* Edit Button */
                .edit-btn {
                    position: absolute;
                    top: 8px;
                    right: 8px;
                    background: rgba(0,0,0,0.6);
                    border: 1px solid rgba(255,255,255,0.2);
                    border-radius: 50%;
                    width: 28px; 
                    height: 28px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: white;
                    opacity: 0;
                    transition: all 0.2s;
                    cursor: pointer;
                    z-index: 10;
                }

                .edit-btn:hover {
                    background: var(--accent-primary);
                    border-color: var(--accent-primary);
                }

                .bike-card:hover .edit-btn {
                    opacity: 1;
                }

                /* Delete Button */
                .delete-btn {
                    position: absolute;
                    top: 8px;
                    right: 40px; /* Position to the left of edit button */
                    background: rgba(0,0,0,0.6);
                    border: 1px solid rgba(255,255,255,0.2);
                    border-radius: 50%;
                    width: 28px; 
                    height: 28px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: white;
                    opacity: 0;
                    transition: all 0.2s;
                    cursor: pointer;
                    z-index: 10;
                }

                .delete-btn:hover {
                    background: #dc2626;
                    border-color: #dc2626;
                }

                .bike-card:hover .delete-btn {
                    opacity: 1;
                }

                /* Override current badge color */
                .current-badge {
                    position: absolute;
                    top: -10px;
                    right: -10px;
                    background: var(--accent-primary);
                    color: white;
                    padding: 4px 8px;
                    border-radius: 12px;
                    font-size: 0.8rem;
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    font-weight: bold;
                    font-family: 'Rajdhani', sans-serif;
                    z-index: 20;
                    box-shadow: 0 2px 5px rgba(0,0,0,0.5);
                }
                
                /* Modal */
                .modal-overlay {
                    position: fixed;
                    top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(0,0,0,0.8);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 1000;
                    backdrop-filter: blur(4px);
                }
                .modal-content {
                    background: #2a2a2a;
                    padding: 2rem;
                    border-radius: 12px;
                    width: 100%;
                    max-width: 400px;
                    text-align: left;
                    border: 1px solid #444;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.5);
                }
                .modal-content h2 { margin-top: 0; margin-bottom: 1.5rem; color: white; font-family: 'Orbitron', sans-serif; letter-spacing: 1px; }
                .form-group { margin-bottom: 1rem; }
                .form-group label { display: block; margin-bottom: 0.5rem; color: #ccc; font-size: 0.9rem; }
                .form-group input[type="text"] { 
                    width: 100%; padding: 0.8rem; 
                    background: #1a1a1a; border: 1px solid #444; 
                    border-radius: 6px; color: white; 
                    font-family: 'Rajdhani', sans-serif;
                }
                .form-group input:focus { border-color: var(--accent-primary); outline: none; }
                
                .file-select-btn {
                    display: inline-block;
                    padding: 0.6rem 1rem;
                    background: #333;
                    border: 1px solid #555;
                    border-radius: 6px;
                    cursor: pointer;
                    color: white;
                    font-size: 0.9rem;
                    transition: all 0.2s;
                }
                .file-select-btn:hover {
                    background: #444;
                    border-color: var(--accent-primary);
                }
                .selected-file-name {
                    margin-left: 10px;
                    font-size: 0.9rem;
                    color: #999;
                }

                .form-actions { display: flex; justify-content: flex-end; gap: 1rem; margin-top: 1.5rem; }
                .btn-cancel { background: transparent; border: none; color: #999; cursor: pointer; font-family: 'Rajdhani', sans-serif; font-weight: 600; }
                .btn-cancel:hover { color: white; }
                .btn-save { background: var(--accent-primary); color: white; border: none; padding: 0.6rem 1.5rem; border-radius: 6px; cursor: pointer; font-weight: bold; font-family: 'Rajdhani', sans-serif; letter-spacing: 1px; transition: background 0.2s; }
                .btn-save:hover { background: #b00000; }

                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    );
};

export default BikeSelectionPage;
