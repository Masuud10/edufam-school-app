
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useSchoolScopedData } from './useSchoolScopedData';

interface PaymentData {
  studentFeeId: string;
  amount: number;
  paymentMethod: 'mpesa' | 'cash' | 'bank_transfer' | 'card' | 'cheque';
  referenceNumber?: string;
  mpesaCode?: string;
  bankReference?: string;
}

interface PaymentResponse {
  success?: boolean;
  error?: string;
  transaction_id?: string;
  new_status?: string;
  total_paid?: number;
  remaining_amount?: number;
}

export const useFeePayments = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const { schoolId, isSystemAdmin } = useSchoolScopedData();

  const recordPayment = async (paymentData: PaymentData) => {
    // CRITICAL SECURITY FIX: Enhanced validation and authorization
    if (!schoolId && !isSystemAdmin) {
      const message = 'School ID is required to record payments';
      setError(message);
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
      return { data: null, error: message };
    }

    setLoading(true);
    setError(null);

    try {
      console.log('Recording fee payment with enhanced validation:', paymentData);

      // CRITICAL: Enhanced validation using server-side function
      const validationData = {
        school_id: schoolId,
        amount: paymentData.amount,
        student_fee_id: paymentData.studentFeeId
      };

      const { data: validationResult, error: validationError } = await supabase.rpc(
        'validate_finance_officer_transaction', 
        { p_transaction_data: validationData }
      );

      if (validationError || !(validationResult as any)?.valid) {
        throw new Error((validationResult as any)?.error || 'Transaction validation failed');
      }

      // Validate payment data
      if (!paymentData.studentFeeId || !paymentData.amount || paymentData.amount <= 0) {
        throw new Error('Invalid payment data: Student fee ID and valid amount are required');
      }

      if (!paymentData.paymentMethod) {
        throw new Error('Payment method is required');
      }

      // Enhanced payment method validation
      const validPaymentMethods = ['mpesa', 'cash', 'bank_transfer', 'card', 'cheque'];
      if (!validPaymentMethods.includes(paymentData.paymentMethod)) {
        throw new Error('Invalid payment method selected');
      }

      // For MPESA payments, require MPESA code
      if (paymentData.paymentMethod === 'mpesa' && !paymentData.mpesaCode) {
        throw new Error('MPESA code is required for MPESA payments');
      }

      // For bank transfers, require bank reference
      if (paymentData.paymentMethod === 'bank_transfer' && !paymentData.bankReference) {
        throw new Error('Bank reference is required for bank transfers');
      }

      // CRITICAL: Use enhanced payment recording function
      const { data, error: paymentError } = await supabase.rpc('record_fee_payment', {
        p_student_fee_id: paymentData.studentFeeId,
        p_amount: paymentData.amount,
        p_payment_method: paymentData.paymentMethod,
        p_reference_number: paymentData.referenceNumber || null,
        p_mpesa_code: paymentData.mpesaCode || null,
        p_bank_reference: paymentData.bankReference || null
      });

      if (paymentError) {
        console.error('Payment recording error:', paymentError);
        throw new Error(`Failed to record payment: ${paymentError.message}`);
      }

      // Type cast the response to handle JSON structure
      const response = data as PaymentResponse;

      if (response?.error) {
        throw new Error(response.error);
      }

      console.log('Payment recorded successfully:', response);
      
      toast({
        title: "Payment Recorded",
        description: `Payment of KES ${paymentData.amount.toLocaleString()} recorded successfully`,
      });

      return { data: response, error: null };
    } catch (err: any) {
      const message = err?.message || 'Failed to record payment';
      console.error('Payment recording error:', err);
      setError(message);
      toast({
        title: "Payment Error",
        description: message,
        variant: "destructive",
      });
      return { data: null, error: message };
    } finally {
      setLoading(false);
    }
  };

  return {
    recordPayment,
    loading,
    error
  };
};
