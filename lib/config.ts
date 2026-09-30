export const isDemo = () => process.env.DEMO_MODE === 'true' && process.env.NODE_ENV === 'development' && !process.env.VERCEL;
export const isConfigured = () => Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
