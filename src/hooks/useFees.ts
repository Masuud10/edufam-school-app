
import { useState, useEffect, useCallback } from 'react';
import { useSchoolScopedData } from './useSchoolScopedData';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface Fee {
  id: string;
  school_id: string;
  amount: number;
  due_date: string;
  term: string;
  category?: string;
  academic_year: string;
  student_id?: string;
  class_id?: string;
  status: 'pending' | 'paid' | 'partial' | 'overdue';
  paid_amount: number;
  paid_date?: string;
  payment_method?: string;
  mpesa_code?: string;
  discount_amount: number;
  late_fee_amount: number;
  installment_number: number;
  created_at: string;
  updated_at: string;
}

interface StudentFee {
  id: string;
  school_id: string;
  student_id: string;
  fee_id: string;
  status: 'paid' | 'unpaid' | 'partial';
  amount_paid: number;
  due_date: string;
  created_at: string;
  updated_at: string;
  fee?: {
    id: string;
    amount: number;
    category?: string;
    term: string;
    due_date: string;
    academic_year: string;
  };
  student?: {
    id: string;
    name: string;
    admission_number: string;
  };
}

export const useFees = () => {
  const [fees, setFees] = useState<Fee[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { isSystemAdmin, schoolId } = useSchoolScopedData();
  const { toast } = useToast();

  const fetchFees = useCallback(async () => {
    if (!schoolId && !isSystemAdmin) {
      setFees([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let query = supabase.from('fees').select('*');

      if (!isSystemAdmin && schoolId) {
        query = query.eq('school_id', schoolId);
      }

      query = query.order('created_at', { ascending: false });

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      // Type the data properly with status casting
      const typedData = (data || []).map(item => ({
        ...item,
        status: item.status as 'pending' | 'paid' | 'partial' | 'overdue'
      }));

      setFees(typedData);
      setError(null);
    } catch (err: any) {
      const message = err?.message || 'Failed to fetch fees';
      setError(message);
      setFees([]);
      toast({
        title: "Fees Fetch Error",
        description: message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [isSystemAdmin, schoolId, toast]);

  const createFee = async (feeData: {
    amount: number;
    term: string;
    category?: string;
    due_date: string;
    student_id: string;
    academic_year?: string;
  }) => {
    try {
      const { data, error } = await supabase
        .from('fees')
        .insert({
          ...feeData,
          school_id: schoolId,
          academic_year: feeData.academic_year || new Date().getFullYear().toString(),
          status: 'pending',
          paid_amount: 0,
          discount_amount: 0,
          late_fee_amount: 0,
          installment_number: 1,
        })
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Fee Created",
        description: `Fee has been created successfully.`,
      });

      fetchFees();
      return { data, error: null };
    } catch (err: any) {
      const message = err?.message || 'Failed to create fee';
      toast({
        title: "Create Error",
        description: message,
        variant: "destructive",
      });
      return { data: null, error: message };
    }
  };

  const assignFeeToStudents = async (feeData: {
    amount: number;
    term: string;
    category?: string;
    due_date: string;
    academic_year?: string;
    student_ids: string[];
  }) => {
    try {
      console.log('Starting fee assignment with data:', feeData);

      if (!schoolId) {
        throw new Error('School ID is required');
      }

      if (!feeData.student_ids || feeData.student_ids.length === 0) {
        throw new Error('At least one student must be selected');
      }

      // Create individual fee records for each student
      const feeRecords = feeData.student_ids.map(studentId => ({
        school_id: schoolId,
        student_id: studentId,
        amount: feeData.amount,
        term: feeData.term,
        category: feeData.category || 'General',
        due_date: feeData.due_date,
        academic_year: feeData.academic_year || new Date().getFullYear().toString(),
        status: 'pending',
        paid_amount: 0,
        discount_amount: 0,
        late_fee_amount: 0,
        installment_number: 1,
      }));

      console.log('Creating fee records:', feeRecords);

      const { data: createdFees, error: feeError } = await supabase
        .from('fees')
        .insert(feeRecords)
        .select();

      if (feeError) {
        console.error('Error creating fees:', feeError);
        throw feeError;
      }

      console.log('Successfully created fees:', createdFees);

      // Create student_fees records to link students to fees
      const studentFeeRecords = createdFees.map(fee => ({
        school_id: schoolId,
        student_id: fee.student_id,
        fee_id: fee.id,
        status: 'unpaid' as const,
        amount_paid: 0,
        due_date: fee.due_date,
      }));

      console.log('Creating student fee records:', studentFeeRecords);

      const { error: studentFeeError } = await supabase
        .from('student_fees')
        .insert(studentFeeRecords);

      if (studentFeeError) {
        console.error('Error creating student fees:', studentFeeError);
        throw studentFeeError;
      }

      toast({
        title: "Fees Assigned Successfully",
        description: `Fees assigned to ${feeData.student_ids.length} student(s).`,
      });

      fetchFees();
      return { data: createdFees, error: null };
    } catch (err: any) {
      console.error('Fee assignment error:', err);
      const message = err?.message || 'Failed to assign fees';
      toast({
        title: "Assignment Error",
        description: message,
        variant: "destructive",
      });
      return { data: null, error: message };
    }
  };

  const assignFeeToClass = async (feeData: {
    amount: number;
    term: string;
    category?: string;
    due_date: string;
    academic_year?: string;
    class_id: string;
  }) => {
    try {
      console.log('Starting class fee assignment with data:', feeData);

      if (!schoolId) {
        throw new Error('School ID is required');
      }

      // Get all students in the class
      const { data: students, error: studentsError } = await supabase
        .from('students')
        .select('id')
        .eq('class_id', feeData.class_id)
        .eq('school_id', schoolId)
        .eq('is_active', true);

      if (studentsError) {
        console.error('Error fetching students:', studentsError);
        throw studentsError;
      }

      if (!students || students.length === 0) {
        throw new Error('No active students found in the selected class');
      }

      console.log(`Found ${students.length} students in class`);

      // Create individual fee records for each student
      const feeRecords = students.map(student => ({
        school_id: schoolId,
        student_id: student.id,
        class_id: feeData.class_id,
        amount: feeData.amount,
        term: feeData.term,
        category: feeData.category || 'General',
        due_date: feeData.due_date,
        academic_year: feeData.academic_year || new Date().getFullYear().toString(),
        status: 'pending',
        paid_amount: 0,
        discount_amount: 0,
        late_fee_amount: 0,
        installment_number: 1,
      }));

      console.log('Creating fee records for students:', feeRecords.length);

      const { data: createdFees, error: feeError } = await supabase
        .from('fees')
        .insert(feeRecords)
        .select();

      if (feeError) {
        console.error('Error creating student fees:', feeError);
        throw feeError;
      }

      console.log('Successfully created fees for students:', createdFees?.length || 0);

      toast({
        title: "Class Fee Assigned Successfully",
        description: `Fee assigned to ${students.length} students in the selected class.`,
      });

      fetchFees();
      return { data: createdFees, error: null };
    } catch (err: any) {
      console.error('Class fee assignment error:', err);
      const message = err?.message || 'Failed to assign fee to class';
      toast({
        title: "Class Assignment Error",
        description: message,
        variant: "destructive",
      });
      return { data: null, error: message };
    }
  };

  const updateFee = async (id: string, updates: Partial<Fee>) => {
    try {
      const { data, error } = await supabase
        .from('fees')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Fee Updated",
        description: "Fee has been updated successfully.",
      });

      fetchFees();
      return { data, error: null };
    } catch (err: any) {
      const message = err?.message || 'Failed to update fee';
      toast({
        title: "Update Error",
        description: message,
        variant: "destructive",
      });
      return { data: null, error: message };
    }
  };

  const deleteFee = async (id: string) => {
    try {
      const { error } = await supabase
        .from('fees')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Fee Deleted",
        description: "Fee has been deleted successfully.",
      });

      fetchFees();
      return { error: null };
    } catch (err: any) {
      const message = err?.message || 'Failed to delete fee';
      toast({
        title: "Delete Error",
        description: message,
        variant: "destructive",
      });
      return { error: message };
    }
  };

  useEffect(() => {
    fetchFees();
  }, [fetchFees]);

  return {
    fees,
    loading,
    error,
    createFee,
    assignFeeToStudents,
    assignFeeToClass,
    updateFee,
    deleteFee,
    refetch: fetchFees
  };
};

export const useStudentFees = (studentId?: string) => {
  const [studentFees, setStudentFees] = useState<StudentFee[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { isSystemAdmin, schoolId } = useSchoolScopedData();
  const { toast } = useToast();

  const fetchStudentFees = useCallback(async () => {
    if (!schoolId && !isSystemAdmin) {
      setStudentFees([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let query = supabase
        .from('student_fees')
        .select(`
          *,
          fee:fees(id, amount, category, term, due_date, academic_year),
          student:students(id, name, admission_number)
        `);

      if (!isSystemAdmin && schoolId) {
        query = query.eq('school_id', schoolId);
      }

      if (studentId) {
        query = query.eq('student_id', studentId);
      }

      query = query.order('created_at', { ascending: false });

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      // Properly type the data
      const typedData = (data || []).map(item => ({
        ...item,
        status: item.status as 'paid' | 'unpaid' | 'partial',
        fee: item.fee && typeof item.fee === 'object' && item.fee !== null && 'amount' in item.fee 
          ? item.fee as {
              id: string;
              amount: number;
              category?: string;
              term: string;
              due_date: string;
              academic_year: string;
            }
          : undefined,
        student: item.student && typeof item.student === 'object' && item.student !== null && 'name' in item.student
          ? item.student as { id: string; name: string; admission_number: string }
          : undefined
      }));

      setStudentFees(typedData);
      setError(null);
    } catch (err: any) {
      const message = err?.message || 'Failed to fetch student fees';
      setError(message);
      setStudentFees([]);
      toast({
        title: "Student Fees Fetch Error",
        description: message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [isSystemAdmin, schoolId, studentId, toast]);

  const updateStudentFeePayment = async (
    id: string, 
    amountPaid: number, 
    status: 'paid' | 'unpaid' | 'partial'
  ) => {
    try {
      const { data, error } = await supabase
        .from('student_fees')
        .update({ 
          amount_paid: amountPaid, 
          status,
          updated_at: new Date().toISOString() 
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Payment Updated",
        description: "Student fee payment has been updated successfully.",
      });

      fetchStudentFees();
      return { data, error: null };
    } catch (err: any) {
      const message = err?.message || 'Failed to update payment';
      toast({
        title: "Update Error",
        description: message,
        variant: "destructive",
      });
      return { data: null, error: message };
    }
  };

  useEffect(() => {
    fetchStudentFees();
  }, [fetchStudentFees]);

  return {
    studentFees,
    loading,
    error,
    updateStudentFeePayment,
    refetch: fetchStudentFees
  };
};
