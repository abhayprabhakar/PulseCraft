import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Upload, FileText } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { bikesApi } from '../services/api';
import { BikeDocumentProfile, BikeDocumentType, BikeDocumentUpdate } from '../types/bike';

const DOC_UPLOAD_CONFIG: Array<{ type: BikeDocumentType; label: string; urlField: keyof BikeDocumentProfile }> = [
    { type: 'driving_license', label: 'Driving License PDF', urlField: 'driving_license_pdf_url' },
    { type: 'insurance', label: 'Insurance PDF', urlField: 'insurance_pdf_url' },
    { type: 'pollution', label: 'Pollution Certificate PDF', urlField: 'pollution_pdf_url' },
    { type: 'registration', label: 'Registration Certificate PDF', urlField: 'registration_certificate_pdf_url' }
];

type FieldType = 'text' | 'date';
type FieldConfig = { key: keyof BikeDocumentUpdate; placeholder: string; type?: FieldType };

const FIELD_CONFIG: FieldConfig[] = [
    { key: 'owner_name', placeholder: 'Owner Name' },
    { key: 'registration_number', placeholder: 'Registration Number' },
    { key: 'chassis_number', placeholder: 'Chassis Number' },
    { key: 'engine_number', placeholder: 'Engine Number' },
    { key: 'driving_license_number', placeholder: 'Driving License Number' },
    { key: 'driving_license_expiry', placeholder: 'Driving License Expiry', type: 'date' },
    { key: 'insurance_policy_number', placeholder: 'Insurance Policy Number' },
    { key: 'insurance_expiry', placeholder: 'Insurance Expiry', type: 'date' },
    { key: 'pollution_certificate_number', placeholder: 'Pollution Certificate Number' },
    { key: 'pollution_expiry', placeholder: 'Pollution Expiry', type: 'date' },
    { key: 'registration_certificate_number', placeholder: 'RC Number' },
    { key: 'registration_expiry', placeholder: 'RC Expiry', type: 'date' },
];

const FIELD_SECTIONS: Array<{ title: string; keys: Array<keyof BikeDocumentUpdate> }> = [
    {
        title: 'Ownership & Vehicle',
        keys: ['owner_name', 'registration_number', 'chassis_number', 'engine_number'],
    },
    {
        title: 'Driving License',
        keys: ['driving_license_number', 'driving_license_expiry'],
    },
    {
        title: 'Insurance',
        keys: ['insurance_policy_number', 'insurance_expiry'],
    },
    {
        title: 'Pollution Certificate',
        keys: ['pollution_certificate_number', 'pollution_expiry'],
    },
    {
        title: 'Registration Certificate',
        keys: ['registration_certificate_number', 'registration_expiry'],
    },
];

const BikeDocumentsPage: React.FC = () => {
    const { bikeId } = useParams<{ bikeId: string }>();
    const { bikes, currentBike, selectBike } = useAuth();
    const navigate = useNavigate();

    const [formData, setFormData] = useState<BikeDocumentUpdate>({});
    const [documentData, setDocumentData] = useState<BikeDocumentProfile | null>(null);
    const [selectedFiles, setSelectedFiles] = useState<Partial<Record<BikeDocumentType, File>>>({});
    const uploadInputsRef = useRef<Partial<Record<BikeDocumentType, HTMLInputElement | null>>>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [uploadingDocType, setUploadingDocType] = useState<BikeDocumentType | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isEditing, setIsEditing] = useState(false);

    const parsedBikeId = useMemo(() => {
        const parsed = Number(bikeId);
        return Number.isNaN(parsed) ? null : parsed;
    }, [bikeId]);

    const bike = useMemo(() => bikes.find((item) => item.id === parsedBikeId), [bikes, parsedBikeId]);

    useEffect(() => {
        if (bike && currentBike?.id !== bike.id) {
            selectBike(bike);
        }
    }, [bike, currentBike?.id, selectBike]);

    useEffect(() => {
        const loadDocuments = async () => {
            if (!parsedBikeId) {
                setError('Invalid bike ID.');
                setLoading(false);
                return;
            }

            setLoading(true);
            setError(null);
            try {
                const docs = await bikesApi.getDocuments(parsedBikeId);
                setDocumentData(docs);
                setFormData({
                    registration_number: docs.registration_number || '',
                    chassis_number: docs.chassis_number || '',
                    engine_number: docs.engine_number || '',
                    owner_name: docs.owner_name || '',
                    driving_license_number: docs.driving_license_number || '',
                    driving_license_expiry: docs.driving_license_expiry || '',
                    insurance_policy_number: docs.insurance_policy_number || '',
                    insurance_expiry: docs.insurance_expiry || '',
                    pollution_certificate_number: docs.pollution_certificate_number || '',
                    pollution_expiry: docs.pollution_expiry || '',
                    registration_certificate_number: docs.registration_certificate_number || '',
                    registration_expiry: docs.registration_expiry || '',
                    notes: docs.notes || ''
                });
            } catch (apiError) {
                console.error('Failed to load bike documents', apiError);
                setError('Failed to load bike documents.');
            } finally {
                setLoading(false);
            }
        };

        loadDocuments();
    }, [parsedBikeId]);

    const getFileUrl = (url?: string) => {
        if (!url) {
            return null;
        }
        const baseUrl = localStorage.getItem('api_url') || import.meta.env.VITE_API_URL || 'http://localhost:8000';
        const cleanBaseUrl = baseUrl.replace('/api/v1', '');
        return url.startsWith('http') ? url : `${cleanBaseUrl}${url}`;
    };

    const handleFieldChange = (field: keyof BikeDocumentUpdate, value: string) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
    };

    const handleSave = async () => {
        if (!parsedBikeId) {
            return;
        }

        setSaving(true);
        setError(null);
        try {
            const updated = await bikesApi.updateDocuments(parsedBikeId, formData);
            setDocumentData(updated);
            setIsEditing(false);
            alert('Bike documents saved successfully.');
        } catch (apiError) {
            console.error('Failed to save bike documents', apiError);
            setError('Failed to save bike documents.');
        } finally {
            setSaving(false);
        }
    };

    const handleFileSelect = (docType: BikeDocumentType, file: File | null) => {
        setSelectedFiles((prev) => ({
            ...prev,
            [docType]: file || undefined
        }));
    };

    const handleUpload = async (docType: BikeDocumentType) => {
        if (!parsedBikeId || !selectedFiles[docType]) {
            return;
        }

        const selectedFile = selectedFiles[docType];
        if (!selectedFile) {
            return;
        }

        setUploadingDocType(docType);
        setError(null);
        try {
            const uploadResponse = await bikesApi.uploadDocumentPdf(parsedBikeId, docType, selectedFile);
            setDocumentData((prev) => {
                if (!prev) {
                    return prev;
                }

                const urlField = DOC_UPLOAD_CONFIG.find((item) => item.type === docType)?.urlField;
                if (!urlField) {
                    return prev;
                }

                return {
                    ...prev,
                    [urlField]: uploadResponse.pdf_url
                };
            });

            setSelectedFiles((prev) => ({ ...prev, [docType]: undefined }));
            alert('PDF uploaded successfully.');
        } catch (apiError) {
            console.error('Failed to upload document PDF', apiError);
            setError('Failed to upload selected PDF.');
        } finally {
            setUploadingDocType(null);
        }
    };

    if (loading) {
        return <div style={{ padding: '1.5rem' }}>Loading bike documents...</div>;
    }

    if (!parsedBikeId) {
        return <div style={{ padding: '1.5rem' }}>Invalid bike selected.</div>;
    }

    return (
        <div style={{ maxWidth: '880px', margin: '0 auto', display: 'grid', gap: '1rem' }}>
            <button
                onClick={() => navigate('/select-bike')}
                style={{
                    width: 'fit-content',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    color: 'var(--text-secondary)'
                }}
            >
                <ArrowLeft size={16} /> Back to Bikes
            </button>

            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
                    <div>
                        <h2 style={{ fontFamily: 'var(--font-heading)', marginBottom: '0.25rem' }}>My Garage</h2>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: 0 }}>
                            {bike?.name || currentBike?.name || `Bike #${parsedBikeId}`} document profile
                        </p>
                    </div>
                    <button
                        onClick={() => setIsEditing((prev) => !prev)}
                        style={{ ...buttonStyle, background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
                    >
                        {isEditing ? 'View Mode' : 'Edit Details'}
                    </button>
                </div>

                {error && (
                    <div style={{ marginBottom: '1rem', color: 'var(--accent-secondary)' }}>{error}</div>
                )}

                <div style={{ display: 'grid', gap: '1.25rem' }}>
                    {FIELD_SECTIONS.map((section) => (
                        <div key={section.title} style={{ display: 'grid', gap: '0.5rem' }}>
                            <h4 style={{ margin: 0, color: 'var(--text-primary)' }}>{section.title}</h4>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.9rem' }}>
                                {section.keys.map((key) => {
                                    const field = FIELD_CONFIG.find((f) => f.key === key)!;
                                    const value = formData[key] || '';
                                    const label = field.placeholder;

                                    if (isEditing) {
                                        return (
                                            <label key={field.key as string} style={labelStyle}>
                                                <span>{label}</span>
                                                <input
                                                    type={field.type || 'text'}
                                                    placeholder={field.placeholder}
                                                    value={value}
                                                    onChange={(e) => handleFieldChange(field.key, e.target.value)}
                                                    style={inputStyle}
                                                />
                                            </label>
                                        );
                                    }

                                    return (
                                        <div key={field.key as string} style={labelStyle} title={field.placeholder}>
                                            <span>{label}</span>
                                            <div style={readOnlyStyle}>{value || '—'}</div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>

                <div style={{ marginTop: '1rem' }}>
                    {isEditing ? (
                        <textarea
                            placeholder="Notes"
                            value={formData.notes || ''}
                            onChange={(e) => handleFieldChange('notes', e.target.value)}
                            rows={4}
                            style={{ ...inputStyle, width: '100%', resize: 'vertical' }}
                        />
                    ) : (
                        <div style={{ ...readOnlyStyle, width: '100%', minHeight: '96px', alignItems: 'flex-start' }}>
                            {formData.notes || '—'}
                        </div>
                    )}
                </div>

                {isEditing && (
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        style={{ ...buttonStyle, marginTop: '1rem', minWidth: '180px' }}
                    >
                        {saving ? 'Saving...' : 'Save Document Details'}
                    </button>
                )}
            </div>

            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.25rem' }}>
                <h3 style={{ fontFamily: 'var(--font-heading)', marginBottom: '0.5rem' }}>PDF Attachments</h3>
                {!isEditing && (
                    <p style={{ color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                        Switch to Edit to attach a PDF.
                    </p>
                )}
                <div style={{ display: 'grid', gap: '0.75rem' }}>
                    {DOC_UPLOAD_CONFIG.map((item) => {
                        const uploadedUrl = getFileUrl(documentData?.[item.urlField] as string | undefined);
                        return (
                            <div
                                key={item.type}
                                style={{
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '10px',
                                    padding: '0.75rem',
                                    display: 'grid',
                                    gap: '0.6rem'
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                                    <strong>{item.label}</strong>
                                    {uploadedUrl ? (
                                        <a href={uploadedUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-secondary)' }}>
                                            <FileText size={14} style={{ marginRight: '0.25rem' }} /> View Uploaded PDF
                                        </a>
                                    ) : (
                                        <span style={{ color: 'var(--text-muted)' }}>No PDF uploaded</span>
                                    )}
                                </div>

                                {isEditing && (
                                    <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                        <input
                                            type="file"
                                            accept="application/pdf"
                                            ref={(el) => (uploadInputsRef.current[item.type] = el)}
                                            style={{ display: 'none' }}
                                            onChange={(e) => handleFileSelect(item.type, e.target.files?.[0] || null)}
                                        />
                                        <button
                                            onClick={() => uploadInputsRef.current[item.type]?.click()}
                                            style={buttonStyle}
                                        >
                                            <Upload size={14} />
                                            {selectedFiles[item.type]?.name ? `Attach: ${selectedFiles[item.type]?.name}` : 'Choose PDF'}
                                        </button>
                                        <button
                                            onClick={() => handleUpload(item.type)}
                                            disabled={uploadingDocType === item.type || !selectedFiles[item.type]}
                                            style={buttonStyle}
                                        >
                                            {uploadingDocType === item.type ? 'Uploading...' : 'Upload PDF'}
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

const inputStyle: React.CSSProperties = {
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-color)',
    borderRadius: '8px',
    padding: '0.6rem 0.7rem',
    outline: 'none'
};

const readOnlyStyle: React.CSSProperties = {
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-color)',
    borderRadius: '8px',
    padding: '0.6rem 0.7rem',
    display: 'flex',
    alignItems: 'center',
    minHeight: '42px'
};

const labelStyle: React.CSSProperties = {
    display: 'grid',
    gap: '0.35rem',
    color: 'var(--text-muted)',
    fontSize: '0.9rem'
};

const buttonStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.4rem',
    background: 'var(--accent-primary)',
    color: 'var(--text-primary)',
    border: 'none',
    borderRadius: '8px',
    padding: '0.55rem 0.9rem',
    fontWeight: 600
};

export default BikeDocumentsPage;
