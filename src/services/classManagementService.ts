import { supabase } from '@/integrations/supabase/client';

interface AssignTeacherToClassParams {
  teacherId: string;
  classId: string;
  subjectId?: string;
}

interface EnrollStudentParams {
  studentId: string;
  classId: string;
  academicYear?: string;
}

interface LinkParentToStudentParams {
  parentId: string;
  studentId: string;
  relationshipType?: string;
  isPrimaryContact?: boolean;
}

export const classManagementService = {
  // Assign teacher to class
  assignTeacherToClass: async (params: AssignTeacherToClassParams) => {
    try {
      // Get school_id from class
      const { data: classData, error: classError } = await supabase
        .from('classes')
        .select('school_id')
        .eq('id', params.classId)
        .single();

      if (classError) throw classError;
      if (!classData?.school_id) throw new Error("Could not find school for the class");

      const { data, error } = await supabase
        .from('teacher_classes')
        .insert({
          teacher_id: params.teacherId,
          class_id: params.classId,
          subject_id: params.subjectId || null,
          school_id: classData.school_id
        })
        .select()
        .single();

      if (error) {
        console.error('Error assigning teacher to class:', error);
        throw new Error(error.message);
      }

      return data;
    } catch (error) {
      console.error('Unexpected error in assignTeacherToClass:', error);
      throw new Error(error instanceof Error ? error.message : 'Unknown error occurred');
    }
  },

  // Remove teacher from class
  removeTeacherFromClass: async (teacherId: string, classId: string, subjectId?: string) => {
    try {
      let query = supabase
        .from('teacher_classes')
        .delete()
        .eq('teacher_id', teacherId)
        .eq('class_id', classId);

      if (subjectId) {
        query = query.eq('subject_id', subjectId);
      }

      const { error } = await query;

      if (error) {
        console.error('Error removing teacher from class:', error);
        throw new Error(error.message);
      }

      return { error: null };
    } catch (error) {
      console.error('Unexpected error in removeTeacherFromClass:', error);
      throw new Error(error instanceof Error ? error.message : 'Unknown error occurred');
    }
  },

  // Unassign teacher from class/subject by assignment ID
  unassignTeacher: async (assignmentId: string) => {
    try {
      const { error } = await supabase
        .from('teacher_classes')
        .delete()
        .eq('id', assignmentId);

      if (error) {
        console.error('Error unassigning teacher:', error);
        throw new Error(error.message);
      }

      return { success: true };
    } catch (error) {
      console.error('Unexpected error in unassignTeacher:', error);
      throw new Error(error instanceof Error ? error.message : 'Unknown error occurred');
    }
  },

  // Enroll student in class
  enrollStudent: async (params: EnrollStudentParams) => {
    try {
      const { data: classData, error: classError } = await supabase
        .from('classes')
        .select('school_id')
        .eq('id', params.classId)
        .single();

      if (classError) throw classError;
      if (!classData?.school_id) throw new Error("Could not find school for the class");

      const { data, error } = await supabase
        .from('student_classes')
        .insert({
          student_id: params.studentId,
          class_id: params.classId,
          academic_year: params.academicYear || new Date().getFullYear().toString(),
          enrollment_date: new Date().toISOString().split('T')[0],
          is_active: true,
          school_id: classData.school_id
        })
        .select()
        .single();

      if (error) {
        console.error('Error enrolling student in class:', error);
        throw new Error(error.message);
      }

      return data;
    } catch (error) {
      console.error('Unexpected error in enrollStudent:', error);
      throw new Error(error instanceof Error ? error.message : 'Unknown error occurred');
    }
  },

  removeStudentFromClass: async (studentId: string, classId: string) => {
    try {
      const { error } = await supabase
        .from('student_classes')
        .update({ is_active: false })
        .eq('student_id', studentId)
        .eq('class_id', classId);

      if (error) {
        console.error('Error removing student from class:', error);
        throw new Error(error.message);
      }

      return { error: null };
    } catch (error) {
      console.error('Unexpected error in removeStudentFromClass:', error);
      throw new Error(error instanceof Error ? error.message : 'Unknown error occurred');
    }
  },

  linkParentToStudent: async (params: LinkParentToStudentParams) => {
    try {
      const { data: studentData, error: studentError } = await supabase
        .from('students')
        .select('school_id')
        .eq('id', params.studentId)
        .single();

      if (studentError) throw studentError;
      if (!studentData?.school_id) throw new Error("Could not find school for student");

      const { data, error } = await supabase
        .from('parent_students')
        .insert({
          parent_id: params.parentId,
          student_id: params.studentId,
          relationship_type: params.relationshipType || 'parent',
          is_primary_contact: params.isPrimaryContact || false,
          school_id: studentData.school_id
        })
        .select()
        .single();

      if (error) {
        console.error('Error linking parent to student:', error);
        throw new Error(error.message);
      }

      return data;
    } catch (error) {
      console.error('Unexpected error in linkParentToStudent:', error);
      throw new Error(error instanceof Error ? error.message : 'Unknown error occurred');
    }
  },

  unlinkParentFromStudent: async (parentId: string, studentId: string) => {
    try {
      const { error } = await supabase
        .from('parent_students')
        .delete()
        .eq('parent_id', parentId)
        .eq('student_id', studentId);

      if (error) {
        console.error('Error unlinking parent from student:', error);
        throw new Error(error.message);
      }

      return { error: null };
    } catch (error) {
      console.error('Unexpected error in unlinkParentFromStudent:', error);
      throw new Error(error instanceof Error ? error.message : 'Unknown error occurred');
    }
  },

  getTeachersForClass: async (classId: string) => {
    try {
      const { data, error } = await supabase
        .from('teacher_classes')
        .select(`
          *,
          teacher:profiles!teacher_id(id, name, email),
          subject:subjects(id, name, code)
        `)
        .eq('class_id', classId);

      if (error) {
        console.error('Error getting teachers for class:', error);
        return { data: null, error };
      }

      return { data: data || [], error: null };
    } catch (error) {
      console.error('Unexpected error in getTeachersForClass:', error);
      return { data: null, error };
    }
  },

  getStudentsForClass: async (classId: string) => {
    try {
      const { data, error } = await supabase
        .from('student_classes')
        .select(`
          *,
          student:students(id, name, email, admission_number)
        `)
        .eq('class_id', classId)
        .eq('is_active', true);

      if (error) {
        console.error('Error getting students for class:', error);
        return { data: null, error };
      }

      return { data: data || [], error: null };
    } catch (error) {
      console.error('Unexpected error in getStudentsForClass:', error);
      return { data: null, error };
    }
  },

  getParentsForStudent: async (studentId: string) => {
    try {
      const { data, error } = await supabase
        .from('parent_students')
        .select(`
          *,
          parent:profiles!parent_id(id, name, email)
        `)
        .eq('student_id', studentId);

      if (error) {
        console.error('Error getting parents for student:', error);
        return { data: null, error };
      }

      return { data: data || [], error: null };
    } catch (error) {
      console.error('Unexpected error in getParentsForStudent:', error);
      return { data: null, error };
    }
  }
};
