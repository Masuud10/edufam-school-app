import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AuthUser } from '@/types/auth';

export interface ParentDashboardStats {
  childrenCount: number;
  attendance: number;
  feeBalance: number;
  recentGrade: string;
  recentSubject: string;
}

export const useParentDashboardStats = (user: AuthUser) => {
  const [stats, setStats] = useState<ParentDashboardStats>({
    childrenCount: 0,
    attendance: 0,
    feeBalance: 0,
    recentGrade: "",
    recentSubject: "",
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      if (!user?.id) {
        setLoading(false);
        return;
      }
      
      let attempts = 0;
      const maxAttempts = 3;
      
      while (attempts < maxAttempts) {
        try {
          console.log('📊 Parent Dashboard: Starting stats fetch for parent:', user.id);
          
          // Ultra-optimized single query to get children IDs using new index
          const { data: parentStudents, error: parentError } = await supabase
            .from('parent_students')
            .select('student_id')
            .eq('parent_id', user.id)
            .limit(50); // Reasonable limit for performance

          if (parentError) {
            console.error('📊 Parent students query error:', parentError);
            throw new Error(`Could not fetch your children information: ${parentError.message}`);
          }

          // Check for direct parent relationships in students table (legacy support)
          const { data: directChildren, error: directError } = await supabase
            .from('students')
            .select('id')
            .eq('parent_id', user.id)
            .limit(50);

          if (directError) {
            console.error('📊 Direct children query error:', directError);
            // Don't throw, just log and continue without direct children
          }

          // Combine and deduplicate student IDs
          let childrenIds: string[] = [];
          if (parentStudents) childrenIds = parentStudents.map(x => x.student_id);
          if (directChildren) childrenIds = [...childrenIds, ...directChildren.map(x => x.id)];
          childrenIds = [...new Set(childrenIds)];

          console.log('📊 Found children:', childrenIds.length);

          if (childrenIds.length === 0) {
            console.log('📊 No children found for parent');
            setStats({
              childrenCount: 0,
              attendance: 0,
              feeBalance: 0,
              recentGrade: "",
              recentSubject: "",
            });
            setLoading(false);
            return;
          }

          // Optimized parallel queries with proper limits and timeouts
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8000); // Increased timeout for better reliability

          try {
            const [attendanceResult, feeResult, gradeResult] = await Promise.all([
              // Optimized attendance query for current month only
              supabase
                .from('attendance')
                .select('status')
                .in('student_id', childrenIds)
                .gte('date', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0])
                .lte('date', new Date().toISOString().split('T')[0])
                .limit(200)
                .abortSignal(controller.signal),

              // Optimized fee query with minimal fields and enhanced validation
              supabase
                .from('fees')
                .select('amount, paid_amount, status')
                .in('student_id', childrenIds)
                .not('amount', 'is', null)
                .limit(100)
                .abortSignal(controller.signal),

              // Optimized recent grade query using new index
              supabase
                .from('grades')
                .select('percentage, subjects!subject_id(name)')
                .in('student_id', childrenIds)
                .eq('status', 'released')
                .order('created_at', { ascending: false })
                .limit(1)
                .abortSignal(controller.signal)
            ]);

            clearTimeout(timeoutId);

            // Add warnings for data truncation
            if (attendanceResult.data && attendanceResult.data.length === 200) {
              console.warn('⚠️ Attendance data may be truncated (200 records fetched)');
            }
            if (feeResult.data && feeResult.data.length === 100) {
              console.warn('⚠️ Fee data may be truncated (100 records fetched)');
            }

            // Process results efficiently
            let attendancePercent = 0;
            if (attendanceResult.data && attendanceResult.data.length > 0) {
              const total = attendanceResult.data.length;
              const present = attendanceResult.data.filter(r => r.status?.toLowerCase() === 'present').length;
              attendancePercent = Math.round((present / total) * 100);
            }

            let feeBalance = 0;
            if (feeResult.data) {
              feeBalance = feeResult.data.reduce((sum, fee) => {
                // Only count unpaid or partial fees
                if (fee.status !== 'paid') {
                  return sum + Math.max(0, (fee.amount || 0) - (fee.paid_amount || 0));
                }
                return sum;
              }, 0);
            }

            let recentGrade = "";
            let recentSubject = "";
            if (gradeResult.data && gradeResult.data.length > 0) {
              const grade = gradeResult.data[0] as { percentage: number; subjects?: { name: string } };
              const percent = grade.percentage;
              // Fixed: Added more comprehensive grade boundaries and validation
              if (percent !== undefined && percent !== null && !isNaN(percent)) {
                if (percent >= 90) recentGrade = "A+";
                else if (percent >= 80) recentGrade = "A";
                else if (percent >= 70) recentGrade = "B+";
                else if (percent >= 60) recentGrade = "B";
                else if (percent >= 50) recentGrade = "C+";
                else if (percent >= 40) recentGrade = "C";
                else if (percent >= 30) recentGrade = "D+";
                else if (percent >= 20) recentGrade = "D";
                else recentGrade = "E";
              } else {
                recentGrade = "-";
              }
              recentSubject = grade.subjects?.name || "Subject";
            }

            const resultStats = {
              childrenCount: childrenIds.length,
              attendance: attendancePercent,
              feeBalance,
              recentGrade,
              recentSubject,
            };

            // Add warning if all metrics are zero (possible data issue)
            if (resultStats.childrenCount === 0 && resultStats.attendance === 0 && resultStats.feeBalance === 0) {
              console.warn('⚠️ All parent metrics are zero - possible data or relationship issue');
            }

            setStats(resultStats);
            setLoading(false); // FIXED: Set loading to false on success
            console.log('📊 Parent dashboard stats compiled:', resultStats);
            return; // Success, exit retry loop

          } catch (queryError) {
            clearTimeout(timeoutId);
            if (queryError.name === 'AbortError') {
              throw new Error('Dashboard queries timed out');
            }
            throw queryError;
          }

        } catch (err: unknown) {
          attempts++;
          console.error(`📊 Parent dashboard stats error (attempt ${attempts}/${maxAttempts}):`, err);
          
          // If this is the last attempt, set safe defaults
          if (attempts >= maxAttempts) {
            console.error('📊 Parent dashboard stats failed after all retry attempts');
            setStats({
              childrenCount: 0,
              attendance: 0,
              feeBalance: 0,
              recentGrade: "-",
              recentSubject: "N/A",
            });
            setLoading(false); // FIXED: Set loading to false on final failure
            break;
          }
          
          // Wait before retrying (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempts) * 1000));
        }
      }
      
      // FIXED: Ensure loading is set to false if we somehow exit the loop without setting it
      setLoading(false);
    };

    fetchStats();
  }, [user.id]);

  return { stats, loading };
};
