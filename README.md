# OOM Hotel - Booking Management System

A comprehensive booking management platform for in-hotel beauty and hairdressing services.

## Overview

OOM Hotel is a full-stack web application that connects hotel guests with professional hairdressers and beauty service providers. The platform includes:

- **Admin Dashboard** - Manage bookings, hairdressers, hotels, treatments, and finances
- **Hairdresser PWA** - Mobile app for service providers to manage their appointments and earnings
- **Client Booking Flow** - QR code-based booking system for hotel guests

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite
- **Styling**: Tailwind CSS, shadcn/ui
- **State Management**: TanStack Query (React Query)
- **Backend**: Supabase (PostgreSQL, Auth, Edge Functions)
- **PWA**: vite-plugin-pwa, OneSignal (Push Notifications)
- **Payments**: Stripe

## Getting Started

### Prerequisites

- Node.js 18+
- npm or bun

### Installation

```bash
# Clone the repository
git clone https://github.com/micharozen/oom-hotel.git
cd oom-hotel

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Fill in your Supabase and other API keys
```

### Environment Variables

Create a `.env` file with the following variables:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_ONESIGNAL_APP_ID=your_onesignal_app_id
VITE_STRIPE_PUBLISHABLE_KEY=your_stripe_key
```

### Development

```bash
# Start the development server
npm run dev
```

The app will be available at `http://localhost:5173`

### Build

```bash
# Production build
npm run build

# Preview production build
npm run preview
```

## Project Structure

```
src/
├── components/     # Reusable UI components
│   ├── ui/         # shadcn/ui components
│   ├── pwa/        # PWA-specific components
│   └── admin/      # Admin dashboard components
├── pages/          # Page components
│   ├── pwa/        # Hairdresser PWA pages
│   ├── client/     # Client booking flow pages
│   └── ...         # Admin pages
├── hooks/          # Custom React hooks
├── contexts/       # React contexts
├── lib/            # Utility functions
└── integrations/   # API integrations (Supabase)
```

## Features

### Admin Dashboard
- Dashboard with booking statistics and analytics
- Booking management with status tracking
- Hairdresser management and performance tracking
- Hotel partner management with QR codes
- Treatment menu configuration
- Financial reports and transactions
- Trunk (equipment box) management

### Hairdresser PWA
- Mobile-optimized interface
- Real-time booking notifications
- Appointment management
- Earnings and wallet tracking
- Hotel assignments
- Stripe Connect integration for payouts

### Client Booking
- QR code access from hotel rooms
- Treatment selection with pricing
- Date/time slot booking
- Guest information collection
- Payment processing
- Booking confirmation and management

## Deployment

### Railway

1. Create a new project on [Railway](https://railway.app)
2. Connect your GitHub repository
3. Add environment variables in Railway settings
4. Railway will auto-detect Vite and deploy

### Build Command
```bash
npm run build
```

### Start Command (with serve)
```bash
npx serve -s dist -l $PORT
```

## License

Private - All rights reserved
