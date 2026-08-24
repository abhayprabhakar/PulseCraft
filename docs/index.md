# RAPTOR Documentation

Welcome to the comprehensive developer documentation for the **RAPTOR (Rider Analytics Platform for Track Optimization)** project.

## Table of Contents

1. [Backend Architecture](backend_architecture.md)
   Learn about the FastAPI backend, SQLAlchemy data models, and the Time Series AI integration.
2. [Frontend Architecture](frontend_architecture.md)
   Explore the React + Vite single page application, routing, and key components.
3. [API Reference](api_reference.md)
   Detailed specifications for all REST endpoints across Auth, Rides, Bikes, Friends, Files, and Favorites.
4. [Setup & Deployment](setup_and_deployment.md)
   Step-by-step instructions for getting the local development environment up and running.

## Project Overview

RAPTOR is an IoT- and machine-learning-based platform designed to provide affordable track-performance analytics for amateur motorcycle riders. The system is composed of:

*   **Data Collection (IoT)**: An ESP32-based hardware module that captures IMU, GPS, and OBD telemetry.
*   **Analytics Backend**: A Python API that processes high-frequency telemetry, evaluates riding performance across segments, and identifies areas for improvement.
*   **Time Series AI**: Integrates with LLMs (Google Gemini / Groq) to enrich deterministic analytics into professional racing insights.
*   **Visualization Frontend**: A responsive web application allowing riders to review telemetry logs, compare laps, manage vehicle documents, and chat with their telemetry data.
