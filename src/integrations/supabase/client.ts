// This file is automatically generated. Do not edit it directly.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = "https://lmqyizrnuahkmwauonqr.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxtcXlpenJudWFoa213YXVvbnFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk0NDI0MDgsImV4cCI6MjA2NTAxODQwOH0.w5uRNb2D6Fy7U3mZmwSRoE81BajGa1Us5TcF2t6C4AM";

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: sessionStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce'
  },
  db: {
    schema: 'public'
  },
  global: {
    headers: { 'x-my-custom-header': 'edufam-app' }
  },
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  }
});

// Add connection health check
export const checkDatabaseConnection = async () => {
  try {
    // Use the more robust database connection test
    const { DatabaseConnectionTest } = await import('../../utils/databaseConnectionTest');
    const result = await DatabaseConnectionTest.runFullTest();
    
    if (!result.connected) {
      console.error('Database connection check failed:', result.error);
      return { connected: false, error: result.error || 'Connection failed' };
    }
    
    return { connected: true, status: 'connected' };
  } catch (err) {
    console.error('Database connection check exception:', err);
    return { connected: false, error: 'Connection failed' };
  }
};