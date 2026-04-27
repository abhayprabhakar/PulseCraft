import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { Bike } from '../types/bike';
import { User } from '../types/user';
import { bikesApi, authApi } from '../services/api';

interface AuthContextType {
    token: string | null;
    isAuthenticated: boolean;
    login: (token: string) => void;
    logout: () => void;
    user: User | null;
    currentBike: Bike | null;
    bikes: Bike[];
    selectBike: (bike: Bike | null) => void;
    refreshBikes: () => Promise<void>;
    refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
    const [user, setUser] = useState<User | null>(null);
    const [currentBike, setCurrentBike] = useState<Bike | null>(() => {
        const saved = localStorage.getItem('currentBike');
        return saved ? JSON.parse(saved) : null;
    });
    const [bikes, setBikes] = useState<Bike[]>([]);
    const currentBikeRef = useRef<Bike | null>(currentBike);

    const isAuthenticated = !!token;

    useEffect(() => {
        currentBikeRef.current = currentBike;
    }, [currentBike]);

    useEffect(() => {
        if (token) {
            localStorage.setItem('token', token);
            // Function to load initial bike data
            refreshBikes();
            refreshProfile();
        } else {
            localStorage.removeItem('token');
            localStorage.removeItem('currentBike');
            setBikes([]);
            setCurrentBike(null);
            setUser(null);
        }
    }, [token]);

    const refreshProfile = async () => {
        if (!token) return;
        try {
            const userData = await authApi.getProfile();
            setUser(userData);
        } catch (error) {
            console.error("Failed to fetch profile", error);
        }
    }

    const refreshBikes = async () => {
        if (!token) return;
        try {
            const bikeList = await bikesApi.list();
            setBikes(bikeList);
            const activeBike = currentBikeRef.current;

            // If we have no current bike, but have bikes in the list, try to set a default
            if (!activeBike && bikeList.length > 0) {
                const defaultBike = bikeList.find(b => b.is_default) || bikeList[0];
                selectBike(defaultBike);
            } else if (activeBike) {
                // Verify current bike still exists and update it
                const found = bikeList.find(b => b.id === activeBike.id);
                if (found) {
                    setCurrentBike(found); // Update with latest data
                    currentBikeRef.current = found;
                    localStorage.setItem('currentBike', JSON.stringify(found));
                } else {
                    // Current bike was deleted?
                    if (bikeList.length > 0) {
                        selectBike(bikeList[0]);
                    } else {
                        setCurrentBike(null);
                        localStorage.removeItem('currentBike');
                    }
                }
            }
        } catch (error) {
            console.error("Failed to fetch bikes", error);
        }
    };

    const login = (newToken: string) => {
        setToken(newToken);
    };

    const logout = () => {
        setToken(null);
        setCurrentBike(null);
        localStorage.removeItem('currentBike');
        setUser(null);
    };

    const selectBike = (bike: Bike | null) => {
        currentBikeRef.current = bike;
        setCurrentBike(bike);
        if (bike) {
            localStorage.setItem('currentBike', JSON.stringify(bike));
        } else {
            localStorage.removeItem('currentBike');
        }
    };

    return (
        <AuthContext.Provider value={{ token, isAuthenticated, login, logout, user, currentBike, bikes, selectBike, refreshBikes, refreshProfile }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
