import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import DashboardLayout from './layouts/DashboardLayout';
import DashboardPage from './pages/DashboardPage';
import ChatbotPage from './pages/ChatbotPage';
import ProfilePage from './pages/ProfilePage';
import SettingsPage from './pages/SettingsPage';
import SimulationPage from './pages/SimulationPage';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import BikeSelectionPage from './pages/BikeSelectionPage';
import RidePage from './pages/RidePage';
import BikeDocumentsPage from './pages/BikeDocumentsPage';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import './styles/global.css';

const ProtectedRoute = () => {
    const { isAuthenticated } = useAuth();
    return isAuthenticated ? <Outlet /> : <Navigate to="/signin" replace />;
};

const AuthRedirect = () => {
    const { isAuthenticated } = useAuth();
    return <Navigate to={isAuthenticated ? '/dashboard' : '/signin'} replace />;
};

function App() {
    return (
        <BrowserRouter>
            <AuthProvider>
                <Routes>
                    <Route path="/signin" element={<LoginPage />} />
                    <Route path="/login" element={<Navigate to="/signin" replace />} />
                    <Route path="/signup" element={<SignupPage />} />

                    {/* Protected Routes */}
                    <Route element={<ProtectedRoute />}>
                        <Route path="/select-bike" element={<BikeSelectionPage />} />
                        <Route path="/simulation" element={<SimulationPage />} />
                        {/* Full-screen ride hub — no sidebar */}
                        <Route path="/rides/:id" element={<RidePage />} />

                        <Route path="/" element={<DashboardLayout />}>
                            <Route index element={<Navigate to="/dashboard" replace />} />
                            <Route path="dashboard" element={<DashboardPage />} />
                            <Route path="chatbot" element={<ChatbotPage />} />
                            <Route path="profile" element={<ProfilePage />} />
                            <Route path="settings" element={<SettingsPage />} />
                            <Route path="garage/:bikeId" element={<BikeDocumentsPage />} />
                        </Route>
                    </Route>

                    <Route path="*" element={<AuthRedirect />} />
                </Routes>
            </AuthProvider>
        </BrowserRouter>
    );
}

export default App;
