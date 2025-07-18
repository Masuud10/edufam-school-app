import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

export const useFeeCollectionData = () => {
  const [feeCollectionData, setFeeCollectionData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const { user } = useAuth();

  const fetchFeeCollectionData = useCallback(async () => {
    if (!user?.school_id) {
      console.log('No school_id available for fee collection data');
      setFeeCollectionData([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      
      console.log('Fetching fee collection data for school:', user.school_id);
      
      // First, fetch fees data
      const { data: feesData, error: feesError } = await supabase
        .from('fees')
        .select('student_id, amount, paid_amount')
        .eq('school_id', user.school_id);

      if (feesError) {
        console.error('Error fetching fees data:', feesError);
        throw feesError;
      }

      if (!feesData || feesData.length === 0) {
        setFeeCollectionData([
          { class: 'No Classes', collected: 0, expected: 0 }
        ]);
        return;
      }

      // Get unique student IDs from fees
      const studentIds = [...new Set(feesData.map(fee => fee.student_id))];

      // Fetch students with their class information
      const { data: studentsData, error: studentsError } = await supabase
        .from('students')
        .select(`
          id,
          class_id
        `)
        .in('id', studentIds)
        .eq('school_id', user.school_id);

      if (studentsError) {
        console.error('Error fetching students data:', studentsError);
        throw studentsError;
      }

      // Fetch class information separately
      const classIds = [...new Set(studentsData?.map(s => s.class_id).filter(Boolean) || [])];
      const { data: classesData, error: classesError } = await supabase
        .from('classes')
        .select('id, name')
        .in('id', classIds);

      if (classesError) {
        console.error('Error fetching classes data:', classesError);
        throw classesError;
      }

      // Create a map for quick class lookup
      const classMap = new Map(classesData?.map(c => [c.id, c.name]) || []);

      // Group by class and calculate totals
      const classDataMap = new Map();
      
      feesData.forEach(fee => {
        const student = studentsData?.find(s => s.id === fee.student_id);
        const className = classMap.get(student?.class_id) || 'Unknown Class';
        const amount = Number(fee.amount || 0);
        const paidAmount = Number(fee.paid_amount || 0);
        
        if (!classDataMap.has(className)) {
          classDataMap.set(className, {
            class: className,
            expected: 0,
            collected: 0
          });
        }
        
        const classData = classDataMap.get(className);
        classData.expected += amount;
        classData.collected += paidAmount;
      });

      const collectionData = Array.from(classDataMap.values());
      
      // If no data, provide some default structure
      if (collectionData.length === 0) {
        setFeeCollectionData([
          { class: 'No Classes', collected: 0, expected: 0 }
        ]);
      } else {
        setFeeCollectionData(collectionData);
      }
      
    } catch (err: unknown) {
      console.error('Error fetching fee collection data:', err);
      setError(err instanceof Error ? err : new Error('Unknown error'));
      setFeeCollectionData([]);
    } finally {
      setIsLoading(false);
    }
  }, [user?.school_id]);

  useEffect(() => {
    fetchFeeCollectionData();
  }, [fetchFeeCollectionData]);

  return {
    feeCollectionData,
    isLoading,
    error,
    refetch: fetchFeeCollectionData
  };
};
