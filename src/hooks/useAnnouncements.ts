
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface Announcement {
  id: string;
  title: string;
  content: string;
  target_audience: string[];
  created_by: string;
  school_id?: string;
  expiry_date?: string;
  attachments?: string[];
  is_global: boolean;
  created_at: string;
  creator_name?: string;
}

function createTimeoutPromise<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Request timed out')), ms)
    )
  ]);
}

export const useAnnouncements = () => {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  const fetchAnnouncements = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = supabase
        .from('announcements')
        .select(`
          *,
          profiles!announcements_created_by_fkey(name)
        `)
        .order('created_at', { ascending: false });

      const { data, error: fetchError } = await createTimeoutPromise(
        Promise.resolve(query),
        7000
      );

      if (fetchError) throw fetchError;

      const formattedData = data?.map((item: Announcement & { profiles?: { name: string } }) => ({
        ...item,
        creator_name: item.profiles?.name
      })) || [];

      setAnnouncements(formattedData);
      setError(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch announcements';
      setError(message);
      setAnnouncements([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      fetchAnnouncements();
    } else {
      setAnnouncements([]);
      setLoading(false);
    }
  }, [user, fetchAnnouncements]);

  const createAnnouncement = async (announcement: Omit<Announcement, 'id' | 'created_at' | 'created_by'>) => {
    try {
      const { data, error } = await supabase
        .from('announcements')
        .insert({
          ...announcement,
          created_by: user?.id
        })
        .select()
        .single();

      if (error) throw error;
      await fetchAnnouncements();
      return { data, error: null };
    } catch (error: unknown) {
      return { data: null, error: error instanceof Error ? error : new Error('Unknown error') };
    }
  };

  return {
    announcements,
    loading,
    error,
    createAnnouncement,
    refetch: fetchAnnouncements,
    retry: fetchAnnouncements,
  };
};
