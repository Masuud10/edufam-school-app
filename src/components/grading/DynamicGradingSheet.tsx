import React, { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useSchoolScopedData } from "@/hooks/useSchoolScopedData";
import { useClassCurriculum } from "@/hooks/useClassCurriculum";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Save,
  CheckCircle,
  AlertTriangle,
  BookOpen,
  Send,
  FileText,
} from "lucide-react";
import {
  detectCurriculumType,
  getCurriculumDisplayName,
  getCurriculumBadgeColor,
} from "@/utils/curriculum-detector";
import {
  validateCurriculumType,
  getCurriculumInfo,
} from "@/utils/curriculum-validator";
import { CBCGradingSheet } from "./CBCGradingSheet";
import { IGCSEGradingSheet } from "./IGCSEGradingSheet";
import { EnhancedGradingSheet } from "./EnhancedGradingSheet";

interface Student {
  id: string;
  name: string;
  admission_number?: string;
  roll_number?: string;
}

interface Subject {
  id: string;
  name: string;
  code?: string;
}

interface GradeValue {
  score?: number | null;
  letter_grade?: string | null;
  cbc_performance_level?: string | null;
  percentage?: number | null;
  strand_scores?: Record<string, string>;
  teacher_remarks?: string;
  assessment_type?: string;
  performance_level?: "EM" | "AP" | "PR" | "EX";
  // IGCSE specific fields
  coursework_score?: number;
  exam_score?: number;
  total_score?: number;
}

interface DynamicGradingSheetProps {
  classId: string;
  term: string;
  examType: string;
  onSubmissionSuccess?: () => void;
  isReadOnly?: boolean;
}

export const DynamicGradingSheet: React.FC<DynamicGradingSheetProps> = ({
  classId,
  term,
  examType,
  onSubmissionSuccess,
  isReadOnly = false,
}) => {
  const { user } = useAuth();
  const { schoolId } = useSchoolScopedData();
  const {
    curriculumType,
    loading: curriculumLoading,
    error: curriculumError,
  } = useClassCurriculum(classId);
  const { toast } = useToast();

  const [students, setStudents] = useState<Student[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [grades, setGrades] = useState<
    Record<string, Record<string, GradeValue>>
  >({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [existingGradeStatus, setExistingGradeStatus] = useState<string>("");
  const [existingGradeSubmittedBy, setExistingGradeSubmittedBy] = useState<string>("");

  // Determine if user is principal
  const isPrincipal =
    user?.role === "principal" || user?.role === "edufam_admin";

  // Determine if view-only mode should be enforced (e.g., for past terms/years)
  // For now, treat isReadOnly as the main flag, but you can add logic for past terms/years
  const isViewOnly = isReadOnly;

  // Check if current user can edit grades based on status and ownership
  const canEditGrades = () => {
    // If no existing grades, teachers can create new ones
    if (!existingGradeStatus && !existingGradeSubmittedBy) {
      return user?.role === 'teacher' || isPrincipal;
    }
    
    // For teachers: can only edit if they own the grade and it's in draft status
    if (user?.role === 'teacher') {
      return existingGradeStatus === 'draft' && existingGradeSubmittedBy === user.id;
    }
    
    // Principals can edit any grade except released ones
    if (isPrincipal) {
      return existingGradeStatus !== 'released';
    }
    
    return false;
  };

  const loadGradingData = async () => {
    if (!schoolId || !classId || !term || !examType) {
      console.log("❌ DynamicGradingSheet: Missing required parameters", {
        schoolId: !!schoolId,
        classId: !!classId,
        term: !!term,
        examType: !!examType,
      });
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      console.log("🎓 DynamicGradingSheet: Loading data for", {
        classId,
        term,
        examType,
        curriculumType,
      });

      // Load students in the class
      const { data: studentsData, error: studentsError } = await supabase
        .from("students")
        .select("id, name, admission_number, roll_number")
        .eq("school_id", schoolId)
        .eq("class_id", classId)
        .eq("is_active", true)
        .order("name");

      if (studentsError) {
        console.error("❌ Error loading students:", studentsError);
        throw studentsError;
      }

      if (!studentsData || studentsData.length === 0) {
        console.warn("⚠️ No students found in class:", classId);
        setStudents([]);
        setSubjects([]);
        setGrades({});
        setDataLoaded(true);
        setLoading(false);
        return;
      }

      // Load subjects - try multiple approaches for better compatibility
      let subjectsList: Subject[] = [];

      // First, try class_subjects table
      const { data: classSubjectsData, error: classSubjectsError } = await (
        supabase as any
      )
        .from("class_subjects")
        .select(
          `
          subjects (
            id,
            name,
            code
          )
        `
        )
        .eq("class_id", classId)
        .eq("is_active", true);

      if (!classSubjectsError && classSubjectsData) {
        subjectsList =
          classSubjectsData
            ?.map((cs: { subjects: Subject }) => cs.subjects)
            .filter(Boolean) || [];
      }

      // If no subjects found, try direct subjects table
      if (subjectsList.length === 0) {
        console.log("🔄 Trying direct subjects table...");
        const { data: directSubjectsData, error: directSubjectsError } =
          await supabase
            .from("subjects")
            .select("id, name, code")
            .eq("school_id", schoolId)
            .eq("class_id", classId)
            .eq("is_active", true);

        if (!directSubjectsError && directSubjectsData) {
          subjectsList = directSubjectsData || [];
        }
      }

      // If still no subjects, try subject_teacher_assignments
      if (subjectsList.length === 0) {
        console.log("🔄 Trying subject_teacher_assignments...");
        
        if (user?.role === "teacher") {
          // For teachers, load only their assigned subjects
          const { data: teacherSubjectsData, error: teacherSubjectsError } =
            await supabase
              .from("subject_teacher_assignments")
              .select(
                `
              subject:subjects(id, name, code)
            `
              )
              .eq("teacher_id", user.id)
              .eq("class_id", classId)
              .eq("school_id", schoolId)
              .eq("is_active", true);

          if (!teacherSubjectsError && teacherSubjectsData) {
            subjectsList =
              teacherSubjectsData
                ?.map((item: { subject: Subject }) => item.subject)
                .filter(Boolean) || [];
          }
        } else if (isPrincipal) {
          // For principals, load all subjects assigned to this class
          const { data: allClassSubjectsData, error: allClassSubjectsError } =
            await supabase
              .from("subject_teacher_assignments")
              .select(
                `
              subject:subjects(id, name, code)
            `
              )
              .eq("class_id", classId)
              .eq("school_id", schoolId)
              .eq("is_active", true);

          if (!allClassSubjectsError && allClassSubjectsData) {
            // Remove duplicates by subject ID
            const uniqueSubjects = allClassSubjectsData
              .map((item: { subject: Subject }) => item.subject)
              .filter(Boolean)
              .reduce((acc: Subject[], current: Subject) => {
                if (!acc.find(s => s.id === current.id)) {
                  acc.push(current);
                }
                return acc;
              }, []);
            subjectsList = uniqueSubjects;
          }
        }
      }

      console.log("📚 Subjects found:", subjectsList.length);

      // Load existing grades if any and capture permission info
      const existingGrades: Record<string, Record<string, GradeValue>> = {};
      let gradeStatus = "";
      let gradeSubmittedBy = "";

      if (curriculumType === "cbc") {
        // Load CBC assessments
        const cbcQuery = supabase
          .from("cbc_strand_assessments")
          .select("*")
          .eq("class_id", classId)
          .eq("term", term)
          .eq("assessment_type", examType.toLowerCase());
        
        // For teachers, only load their own assessments. For principals, load all assessments.
        if (!isPrincipal) {
          cbcQuery.eq("teacher_id", user?.id);
        }
        
        const { data: cbcData, error: cbcError } = await cbcQuery;

        if (cbcError) {
          console.warn("⚠️ Error loading CBC assessments:", cbcError);
        } else if (cbcData) {
          cbcData.forEach((assessment) => {
            if (!existingGrades[assessment.student_id]) {
              existingGrades[assessment.student_id] = {};
            }
            if (!existingGrades[assessment.student_id][assessment.subject_id]) {
              existingGrades[assessment.student_id][assessment.subject_id] = {
                strand_scores: {},
                teacher_remarks: "",
              };
            }
            existingGrades[assessment.student_id][
              assessment.subject_id
            ].strand_scores = {
              ...existingGrades[assessment.student_id][assessment.subject_id]
                .strand_scores,
              [assessment.strand_name]: assessment.performance_level,
            };
            existingGrades[assessment.student_id][
              assessment.subject_id
            ].teacher_remarks = assessment.teacher_remarks || "";
          });
        }
      } else if (curriculumType === "igcse") {
        // Load IGCSE grades
        const igcseQuery = supabase
          .from("grades")
          .select("*")
          .eq("class_id", classId)
          .eq("term", term)
          .eq("exam_type", examType)
          .eq("curriculum_type", "igcse")
          .in("status", ["draft", "submitted", "rejected"]);
        
        // For teachers, only load their own grades. For principals, load all grades.
        if (!isPrincipal) {
          igcseQuery.eq("submitted_by", user?.id);
        }
        
        const { data: igcseData, error: igcseError } = await igcseQuery;

        if (igcseError) {
          console.warn("⚠️ Error loading IGCSE grades:", igcseError);
        } else if (igcseData) {
          igcseData.forEach((grade) => {
            if (!existingGrades[grade.student_id]) {
              existingGrades[grade.student_id] = {};
            }
            existingGrades[grade.student_id][grade.subject_id] = {
              score: grade.score,
              percentage: grade.percentage,
              letter_grade: grade.letter_grade,
              teacher_remarks: grade.comments || "",
              coursework_score: grade.coursework_score,
              exam_score: grade.exam_score,
            };
            // Capture status and submitted_by for permission checking
            if (!gradeStatus && grade.status) gradeStatus = grade.status;
            if (!gradeSubmittedBy && grade.submitted_by) gradeSubmittedBy = grade.submitted_by;
          });
        }
      } else {
        // Load standard grades
        const standardQuery = supabase
          .from("grades")
          .select("*")
          .eq("class_id", classId)
          .eq("term", term)
          .eq("exam_type", examType)
          .in("status", ["draft", "submitted", "rejected"]);
        
        // For teachers, only load their own grades. For principals, load all grades.
        if (!isPrincipal) {
          standardQuery.eq("submitted_by", user?.id);
        }
        
        const { data: gradesData, error: gradesError } = await standardQuery;

        if (gradesError) {
          console.warn("⚠️ Error loading standard grades:", gradesError);
        } else if (gradesData) {
          gradesData.forEach((grade) => {
            if (!existingGrades[grade.student_id]) {
              existingGrades[grade.student_id] = {};
            }
            existingGrades[grade.student_id][grade.subject_id] = {
              score: grade.score,
              percentage: grade.percentage,
              letter_grade: grade.letter_grade,
              teacher_remarks: grade.comments || "",
            };
            // Capture status and submitted_by for permission checking
            if (!gradeStatus && grade.status) gradeStatus = grade.status;
            if (!gradeSubmittedBy && grade.submitted_by) gradeSubmittedBy = grade.submitted_by;
          });
        }
      }

      setStudents(studentsData || []);
      setSubjects(subjectsList);
      setGrades(existingGrades);
      setDataLoaded(true);
      setExistingGradeStatus(gradeStatus);
      setExistingGradeSubmittedBy(gradeSubmittedBy);
      setLastSaved(
        existingGrades && Object.keys(existingGrades).length > 0
          ? new Date()
          : null
      );

      console.log("✅ DynamicGradingSheet: Data loaded successfully", {
        students: studentsData?.length || 0,
        subjects: subjectsList.length,
        existingGrades: Object.keys(existingGrades).length,
        curriculumType,
      });

      // Show helpful messages based on data availability
      if (studentsData?.length === 0) {
        toast({
          title: "No Students Found",
          description:
            "No active students found in this class. Please add students to the class first.",
          variant: "default",
        });
      } else if (subjectsList.length === 0) {
        toast({
          title: "No Subjects Found",
          description:
            user?.role === "teacher"
              ? "You are not assigned to teach any subjects for this class. Please contact your principal."
              : "No subjects are assigned to this class. Please assign subjects first.",
          variant: "default",
        });
      } else {
        toast({
          title: "Grading Sheet Ready",
          description: `Ready to enter ${curriculumType.toUpperCase()} grades for ${
            studentsData?.length
          } students and ${subjectsList.length} subjects.`,
          variant: "default",
        });
      }
    } catch (error) {
      console.error("❌ DynamicGradingSheet: Error loading data:", error);
      toast({
        title: "Error",
        description: "Failed to load grading data. Please try again.",
        variant: "destructive",
      });
      setDataLoaded(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGradingData();
  }, [classId, term, examType, schoolId, user?.id, curriculumType]);

  const handleGradeChange = (
    studentId: string,
    subjectId: string,
    value: GradeValue
  ) => {
    setGrades((prev) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        [subjectId]: value,
      },
    }));
    setHasUnsavedChanges(true);
  };

  const saveAsDraft = async () => {
    if (!user?.id || !schoolId) {
      toast({
        title: "Error",
        description: "User or school information is missing.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      let savedCount = 0;

      if (curriculumType === "cbc") {
        // Save CBC assessments as draft
        for (const [studentId, studentGrades] of Object.entries(grades)) {
          for (const [subjectId, gradeValue] of Object.entries(studentGrades)) {
            if (
              gradeValue.strand_scores &&
              Object.keys(gradeValue.strand_scores).length > 0
            ) {
              // Save each strand assessment
              for (const [strandName, performanceLevel] of Object.entries(
                gradeValue.strand_scores
              )) {
                const { error } = await supabase
                  .from("cbc_strand_assessments")
                  .upsert({
                    school_id: schoolId,
                    student_id: studentId,
                    subject_id: subjectId,
                    class_id: classId,
                    strand_name: strandName,
                    performance_level: performanceLevel as
                      | "EM"
                      | "AP"
                      | "PR"
                      | "EX",
                    assessment_type: examType.toLowerCase(),
                    term: term,
                    teacher_remarks: gradeValue.teacher_remarks || "",
                    assessment_date: new Date().toISOString().split("T")[0],
                    teacher_id: user.id,
                    status: "draft",
                  });

                if (error) throw error;
                savedCount++;
              }
            }
          }
        }
      } else if (curriculumType === "igcse") {
        // Save IGCSE grades as draft
        const gradesToSave = [];
        for (const [studentId, studentGrades] of Object.entries(grades)) {
          for (const [subjectId, gradeValue] of Object.entries(studentGrades)) {
            if (gradeValue.coursework_score !== undefined || gradeValue.exam_score !== undefined) {
              gradesToSave.push({
                school_id: schoolId,
                student_id: studentId,
                subject_id: subjectId,
                class_id: classId,
                term: term,
                exam_type: examType,
                score: gradeValue.score,
                max_score: 100,
                percentage: gradeValue.percentage,
                letter_grade: gradeValue.letter_grade,
                coursework_score: gradeValue.coursework_score,
                exam_score: gradeValue.exam_score,
                curriculum_type: "igcse",
                status: "draft",
                submitted_by: user.id,
                submitted_at: new Date().toISOString(),
                comments: gradeValue.teacher_remarks || null,
              });
            }
          }
        }

        if (gradesToSave.length > 0) {
          const { error } = await supabase.from("grades").upsert(gradesToSave, {
            onConflict:
              "school_id,student_id,subject_id,class_id,term,exam_type,submitted_by",
            ignoreDuplicates: false,
          });

          if (error) throw error;
          savedCount = gradesToSave.length;
        }
      } else {
        // Save standard grades as draft
        const gradesToSave = [];
        for (const [studentId, studentGrades] of Object.entries(grades)) {
          for (const [subjectId, gradeValue] of Object.entries(studentGrades)) {
            if (gradeValue.score !== undefined && gradeValue.score !== null) {
              gradesToSave.push({
                school_id: schoolId,
                student_id: studentId,
                subject_id: subjectId,
                class_id: classId,
                term: term,
                exam_type: examType,
                score: gradeValue.score,
                max_score: 100,
                percentage: gradeValue.percentage,
                letter_grade: gradeValue.letter_grade,
                curriculum_type: curriculumType,
                status: "draft",
                submitted_by: user.id,
                submitted_at: new Date().toISOString(),
                comments: gradeValue.teacher_remarks || null,
              });
            }
          }
        }

        if (gradesToSave.length > 0) {
          const { error } = await supabase.from("grades").upsert(gradesToSave, {
            onConflict:
              "school_id,student_id,subject_id,class_id,term,exam_type,submitted_by",
            ignoreDuplicates: false,
          });

          if (error) throw error;
          savedCount = gradesToSave.length;
        }
      }

      setLastSaved(new Date());
      setHasUnsavedChanges(false);

      toast({
        title: "Draft Saved",
        description: `${savedCount} ${
          curriculumType === "cbc" ? "assessments" : "grades"
        } saved as draft successfully.`,
      });
    } catch (error) {
      console.error("Error saving draft:", error);
      toast({
        title: "Save Failed",
        description: "Failed to save draft. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitGrades = async () => {
    if (!user?.id || !schoolId) {
      toast({
        title: "Error",
        description: "User or school information is missing.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      let submittedCount = 0;

      if (curriculumType === "cbc") {
        // Submit CBC assessments
        for (const [studentId, studentGrades] of Object.entries(grades)) {
          for (const [subjectId, gradeValue] of Object.entries(studentGrades)) {
            if (
              gradeValue.strand_scores &&
              Object.keys(gradeValue.strand_scores).length > 0
            ) {
              // Submit each strand assessment
              for (const [strandName, performanceLevel] of Object.entries(
                gradeValue.strand_scores
              )) {
                const { error } = await supabase
                  .from("cbc_strand_assessments")
                  .upsert({
                    school_id: schoolId,
                    student_id: studentId,
                    subject_id: subjectId,
                    class_id: classId,
                    strand_name: strandName,
                    performance_level: performanceLevel as
                      | "EM"
                      | "AP"
                      | "PR"
                      | "EX",
                    assessment_type: examType.toLowerCase(),
                    term: term,
                    teacher_remarks: gradeValue.teacher_remarks || "",
                    assessment_date: new Date().toISOString().split("T")[0],
                    teacher_id: user.id,
                    status: "submitted",
                    submitted_at: new Date().toISOString(),
                  });

                if (error) throw error;
                submittedCount++;
              }
            }
          }
        }
      } else if (curriculumType === "igcse") {
        // Submit IGCSE grades
        const gradesToSubmit = [];
        for (const [studentId, studentGrades] of Object.entries(grades)) {
          for (const [subjectId, gradeValue] of Object.entries(studentGrades)) {
            if (gradeValue.coursework_score !== undefined || gradeValue.exam_score !== undefined) {
              gradesToSubmit.push({
                school_id: schoolId,
                student_id: studentId,
                subject_id: subjectId,
                class_id: classId,
                term: term,
                exam_type: examType,
                score: gradeValue.score,
                max_score: 100,
                percentage: gradeValue.percentage,
                letter_grade: gradeValue.letter_grade,
                coursework_score: gradeValue.coursework_score,
                exam_score: gradeValue.exam_score,
                curriculum_type: "igcse",
                status: "submitted",
                submitted_by: user.id,
                submitted_at: new Date().toISOString(),
                comments: gradeValue.teacher_remarks || null,
              });
            }
          }
        }

        if (gradesToSubmit.length > 0) {
          const { error } = await supabase
            .from("grades")
            .upsert(gradesToSubmit, {
              onConflict:
                "school_id,student_id,subject_id,class_id,term,exam_type,submitted_by",
              ignoreDuplicates: false,
            });

          if (error) throw error;
          submittedCount = gradesToSubmit.length;
        }
      } else {
        // Submit standard grades
        const gradesToSubmit = [];
        for (const [studentId, studentGrades] of Object.entries(grades)) {
          for (const [subjectId, gradeValue] of Object.entries(studentGrades)) {
            if (gradeValue.score !== undefined && gradeValue.score !== null) {
              gradesToSubmit.push({
                school_id: schoolId,
                student_id: studentId,
                subject_id: subjectId,
                class_id: classId,
                term: term,
                exam_type: examType,
                score: gradeValue.score,
                max_score: 100,
                percentage: gradeValue.percentage,
                letter_grade: gradeValue.letter_grade,
                curriculum_type: curriculumType,
                status: "submitted",
                submitted_by: user.id,
                submitted_at: new Date().toISOString(),
                comments: gradeValue.teacher_remarks || null,
              });
            }
          }
        }

        if (gradesToSubmit.length > 0) {
          const { error } = await supabase
            .from("grades")
            .upsert(gradesToSubmit, {
              onConflict:
                "school_id,student_id,subject_id,class_id,term,exam_type,submitted_by",
              ignoreDuplicates: false,
            });

          if (error) throw error;
          submittedCount = gradesToSubmit.length;
        }
      }

      setLastSaved(new Date());
      setHasUnsavedChanges(false);

      toast({
        title: "Grades Submitted Successfully",
        description: `${submittedCount} ${
          curriculumType === "cbc" ? "assessments" : "grades"
        } submitted for principal approval.`,
      });

      if (onSubmissionSuccess) {
        onSubmissionSuccess();
      }
    } catch (error) {
      console.error("Error submitting grades:", error);
      toast({
        title: "Submission Failed",
        description: "Failed to submit grades. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Show curriculum error if any
  if (curriculumError) {
    return (
      <Card className="h-full">
        <CardContent className="p-8">
          <div className="text-center">
            <AlertTriangle className="h-8 w-8 text-red-500 mx-auto mb-4" />
            <AlertTitle className="text-lg font-semibold text-red-800 mb-2">
              Curriculum Error
            </AlertTitle>
            <AlertDescription className="text-red-600 mb-4">
              {curriculumError}
            </AlertDescription>
            <p className="text-sm text-gray-600">
              No curriculum type set for this class. Please update the class
              information.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (curriculumLoading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        <span>Loading curriculum settings...</span>
      </div>
    );
  }

  // Handle missing or invalid curriculum type
  if (curriculumError) {
    const curriculumInfo = getCurriculumInfo(curriculumType);
    return (
      <Alert className="border-red-200 bg-red-50">
        <AlertTriangle className="h-4 w-4 text-red-600" />
        <AlertTitle className="text-red-800">
          Curriculum Configuration Required
        </AlertTitle>
        <AlertDescription className="text-red-700 space-y-2">
          <p>{curriculumError}</p>
          <div className="mt-3 p-3 bg-red-100 rounded-md">
            <p className="font-medium text-red-800 mb-2">
              Valid Curriculum Types:
            </p>
            <ul className="text-sm text-red-700 space-y-1">
              <li>
                • <strong>CBC:</strong> Competency-Based Curriculum (Kenyan)
              </li>
              <li>
                • <strong>IGCSE:</strong> International General Certificate of
                Secondary Education
              </li>
              <li>
                • <strong>Standard:</strong> Traditional numeric grading (0-100)
              </li>
            </ul>
          </div>
          <div className="mt-3 p-3 bg-blue-100 rounded-md">
            <p className="font-medium text-blue-800 mb-2">Debug Information:</p>
            <div className="text-sm text-blue-700 space-y-1">
              <p>
                <strong>Class ID:</strong> {classId}
              </p>
              <p>
                <strong>Current Curriculum:</strong> {curriculumType}
              </p>
              <p>
                <strong>Term:</strong> {term}
              </p>
              <p>
                <strong>Exam Type:</strong> {examType}
              </p>
              <p>
                <strong>School ID:</strong> {schoolId}
              </p>
            </div>
          </div>
          <p className="text-sm mt-2">
            Please contact your system administrator to update the class
            curriculum type, or use the Curriculum Test component to debug.
          </p>
        </AlertDescription>
      </Alert>
    );
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        <span>Loading grading data...</span>
      </div>
    );
  }

  if (!dataLoaded) {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Grading Data Unavailable</AlertTitle>
        <AlertDescription className="space-y-2">
          <p>Unable to load grading data. This could be due to:</p>
          <ul className="list-disc list-inside space-y-1 text-sm">
            <li>No students enrolled in the selected class</li>
            <li>No subjects assigned to the class</li>
            <li>You don't have permission to access this class</li>
            <li>Network connectivity issues</li>
          </ul>
          <p className="text-sm text-muted-foreground mt-2">
            Please check your class and subject assignments, or contact your
            administrator.
          </p>
        </AlertDescription>
      </Alert>
    );
  }

  const hasGradesToSubmit = Object.values(grades).some((studentGrades) =>
    Object.values(studentGrades).some((grade) => {
      if (curriculumType === "cbc") {
        return grade.strand_scores && Object.keys(grade.strand_scores).length > 0;
      } else if (curriculumType === "igcse") {
        return grade.coursework_score !== undefined || grade.exam_score !== undefined;
      } else {
        return grade.score !== undefined && grade.score !== null;
      }
    })
  );

  const curriculumInfo = getCurriculumInfo(curriculumType);
  const curriculumDisplayName =
    curriculumInfo?.name || curriculumType?.toUpperCase() || "STANDARD";
  const curriculumBadgeColor = `bg-${
    curriculumInfo?.color || "gray"
  }-100 text-${curriculumInfo?.color || "gray"}-800`;

  // Render appropriate grading sheet based on curriculum type
  const renderGradingSheet = () => {
    switch (curriculumType) {
      case "cbc":
        return (
          <CBCGradingSheet
            students={students}
            subjects={subjects}
            grades={grades}
            onGradeChange={handleGradeChange}
            isReadOnly={isReadOnly}
            selectedClass={classId}
            selectedTerm={term}
            selectedExamType={examType}
            isPrincipal={isPrincipal}
            isViewOnly={isViewOnly}
          />
        );
      case "igcse":
        return (
          <IGCSEGradingSheet
            students={students}
            subjects={subjects}
            grades={grades}
            onGradeChange={handleGradeChange}
            isReadOnly={isReadOnly}
            selectedClass={classId}
            selectedTerm={term}
            selectedExamType={examType}
            isPrincipal={isPrincipal}
            isViewOnly={isViewOnly}
          />
        );
      default:
        return (
          <EnhancedGradingSheet
            students={students}
            subjects={subjects}
            grades={grades}
            onGradeChange={handleGradeChange}
            curriculumType={curriculumType}
            isReadOnly={isReadOnly}
            selectedClass={classId}
            selectedTerm={term}
            selectedExamType={examType}
            isPrincipal={isPrincipal}
            isViewOnly={isViewOnly}
          />
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <BookOpen className="h-5 w-5" />
              <span>
                {curriculumType === "cbc"
                  ? "CBC Assessment Sheet"
                  : "Grade Sheet"}{" "}
                - {term} {examType}
              </span>
              <Badge className={curriculumBadgeColor}>
                {curriculumDisplayName}
              </Badge>
            </div>
            {!isReadOnly && canEditGrades() && (
              <div className="flex gap-2">
                <Button
                  onClick={saveAsDraft}
                  disabled={saving || !hasGradesToSubmit || !canEditGrades()}
                  variant="outline"
                  className="flex items-center gap-2"
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      Save Draft
                    </>
                  )}
                </Button>
                <Button
                  onClick={handleSubmitGrades}
                  disabled={submitting || !hasGradesToSubmit || !canEditGrades()}
                  className="bg-green-600 hover:bg-green-700 flex items-center gap-2"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      {isPrincipal ? "Submit" : "Submit for Approval"}
                    </>
                  )}
                </Button>
              </div>
            )}
            {!isReadOnly && !canEditGrades() && existingGradeStatus && (
              <div className="text-sm text-muted-foreground">
                {existingGradeStatus === 'submitted' && (
                  <span className="text-amber-600">
                    ⚠️ Grades already submitted - only principals can edit
                  </span>
                )}
                {existingGradeStatus === 'approved' && (
                  <span className="text-green-600">
                    ✅ Grades approved - only principals can edit
                  </span>
                )}
                {existingGradeStatus === 'released' && (
                  <span className="text-purple-600">
                    🔒 Grades released - cannot be edited
                  </span>
                )}
                {existingGradeSubmittedBy && existingGradeSubmittedBy !== user?.id && (
                  <span className="text-red-600">
                    🔒 These grades were created by another teacher
                  </span>
                )}
              </div>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-gray-600 space-y-1">
            <p>
              <strong>Students:</strong> {students.length}
            </p>
            <p>
              <strong>Subjects:</strong> {subjects.length}
            </p>
            <p>
              <strong>Curriculum:</strong> {curriculumDisplayName}
            </p>
            {lastSaved && (
              <p className="text-blue-600">
                <strong>Last saved:</strong> {lastSaved.toLocaleTimeString()}
              </p>
            )}
            {hasUnsavedChanges && (
              <p className="text-orange-600">
                <strong>⚠️ Unsaved changes</strong>
              </p>
            )}
            {curriculumType === "cbc" && (
              <p className="text-blue-600">
                <strong>Note:</strong> Use performance levels (EM, AP, PR, EX)
                to assess competency strands
              </p>
            )}
            {curriculumType === "igcse" && (
              <p className="text-purple-600">
                <strong>Note:</strong> Use IGCSE letter grades (A*, A, B, C, D,
                E, F, U)
              </p>
            )}
            {curriculumType === "standard" && (
              <p className="text-blue-600">
                <strong>Note:</strong> Use numeric scores (0-100) with automatic
                grade calculation
              </p>
            )}

            {/* Debug Information (only in development) */}
            {process.env.NODE_ENV === "development" && (
              <div className="mt-3 p-2 bg-gray-100 rounded text-xs">
                <p className="font-medium text-gray-700 mb-1">Debug Info:</p>
                <p>
                  <strong>Class ID:</strong> {classId}
                </p>
                <p>
                  <strong>Curriculum Type:</strong> {curriculumType}
                </p>
                <p>
                  <strong>Term:</strong> {term}
                </p>
                <p>
                  <strong>Exam Type:</strong> {examType}
                </p>
                <p>
                  <strong>Data Loaded:</strong> {dataLoaded ? "Yes" : "No"}
                </p>
                <p>
                  <strong>Loading:</strong> {loading ? "Yes" : "No"}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Dynamic Grading Sheet */}
      {renderGradingSheet()}

      {/* Submit Section */}
      {!isReadOnly && hasGradesToSubmit && canEditGrades() && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <span className="text-green-800 font-medium">
                  Ready to submit{" "}
                  {curriculumType === "cbc" ? "assessments" : "grades"} for
                  approval
                </span>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={saveAsDraft}
                  disabled={saving || !canEditGrades()}
                  variant="outline"
                  className="flex items-center gap-2"
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <FileText className="h-4 w-4" />
                      Save Draft
                    </>
                  )}
                </Button>
                <Button
                  onClick={handleSubmitGrades}
                  disabled={submitting || !canEditGrades()}
                  className="bg-green-600 hover:bg-green-700 flex items-center gap-2"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      {isPrincipal ? "Submit" : "Submit for Principal Approval"}
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Submission Guidelines */}
      {!isReadOnly && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>Before submitting:</strong>
            <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
              <li>Review all grades for accuracy</li>
              <li>Ensure all scores are within the maximum allowed values</li>
              <li>Add comments where necessary</li>
              <li>
                Save as draft to preserve your work before final submission
              </li>
              <li>
                Once submitted, grades will require principal approval to modify
              </li>
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
};
