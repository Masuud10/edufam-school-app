
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { FileText, Download, Calendar, CheckCircle, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { PDFGenerationService } from '@/services/pdfGenerationService';

interface ReportExporterProps {
  onExport?: (format: string, reportType: string) => void;
}

const ReportExporter = ({ onExport }: ReportExporterProps) => {
  const [reportType, setReportType] = useState('comprehensive');
  const [format, setFormat] = useState('pdf');
  const [isExporting, setIsExporting] = useState(false);
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);
  const { toast } = useToast();

  const reportTypes = [
    { 
      value: 'comprehensive', 
      label: 'Comprehensive System Report',
      description: 'Complete overview of system metrics, finances, and user analytics'
    },
    { 
      value: 'schools', 
      label: 'School Performance Report',
      description: 'Detailed analysis of school performance and operational metrics'
    },
    { 
      value: 'financial', 
      label: 'Financial Analysis Report',
      description: 'Financial overview including revenue, expenses, and collection rates'
    },
    { 
      value: 'system_health', 
      label: 'System Health Report',
      description: 'System performance, uptime, and technical health metrics'
    },
  ];

  const handleExport = async () => {
    setIsExporting(true);
    
    try {
      console.log(`Starting PDF generation for report type: ${reportType}`);
      
      // Call the appropriate PDF generation method based on report type
      switch (reportType) {
        case 'comprehensive':
          await PDFGenerationService.generateComprehensiveReport();
          break;
        case 'schools':
          await PDFGenerationService.generateSchoolPerformanceReport();
          break;
        case 'financial':
          await PDFGenerationService.generateFinancialReport();
          break;
        case 'system_health':
          await PDFGenerationService.generateSystemHealthReport();
          break;
        default:
          throw new Error('Invalid report type selected');
      }
      
      const selectedReport = reportTypes.find(r => r.value === reportType);
      setLastGenerated(new Date().toLocaleString());
      
      toast({
        title: "✅ PDF Report Generated Successfully",
        description: (
          <div className="space-y-1">
            <p className="font-medium">{selectedReport?.label}</p>
            <p className="text-sm text-muted-foreground">
              Professional PDF report with EduFam branding has been downloaded
            </p>
          </div>
        ),
      });
      
      if (onExport) {
        onExport(format, reportType);
      }
    } catch (error) {
      console.error('PDF Report generation error:', error);
      toast({
        title: "❌ PDF Report Generation Failed",
        description: "An error occurred while generating the PDF report. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const selectedReportType = reportTypes.find(r => r.value === reportType);

  return (
    <Card className="shadow-lg">
      <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b">
        <CardTitle className="flex items-center gap-2 text-blue-900">
          <FileText className="h-5 w-5" />
          EduFam PDF Report Generation
        </CardTitle>
        <p className="text-sm text-blue-700">
          Generate professional PDF reports with real-time system data and EduFam branding
        </p>
      </CardHeader>
      <CardContent className="space-y-6 p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Report Type</label>
            <Select value={reportType} onValueChange={setReportType}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {reportTypes.map((type) => (
                  <SelectItem key={type.value} value={type.value} className="py-3">
                    <div>
                      <div className="font-medium">{type.label}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {type.description}
                      </div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Export Format</label>
            <Select value={format} onValueChange={setFormat} disabled>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pdf">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-red-600" />
                    <span>Professional PDF</span>
                    <Badge variant="secondary" className="ml-2">Only Format</Badge>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Report Preview */}
        {selectedReportType && (
          <div className="bg-gray-50 p-4 rounded-lg border">
            <h4 className="font-medium text-gray-900 mb-2">PDF Report Preview</h4>
            <p className="text-sm text-gray-600 mb-3">{selectedReportType.description}</p>
            <div className="flex items-center gap-4 text-xs text-gray-500">
              <div className="flex items-center gap-1">
                <CheckCircle className="h-3 w-3 text-green-600" />
                <span>EduFam Branding & Logo</span>
              </div>
              <div className="flex items-center gap-1">
                <CheckCircle className="h-3 w-3 text-green-600" />
                <span>Real Database Data</span>
              </div>
              <div className="flex items-center gap-1">
                <CheckCircle className="h-3 w-3 text-green-600" />
                <span>Professional PDF Format</span>
              </div>
              <div className="flex items-center gap-1">
                <CheckCircle className="h-3 w-3 text-green-600" />
                <span>Formatted Tables & Charts</span>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-4 border-t">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="h-4 w-4" />
            <span>Live system data • PDF format only</span>
            {lastGenerated && (
              <Badge variant="outline" className="ml-2">
                Last Generated: {lastGenerated}
              </Badge>
            )}
          </div>
          
          <Button 
            onClick={handleExport} 
            disabled={isExporting}
            className="bg-blue-600 hover:bg-blue-700 text-white min-w-[160px]"
          >
            {isExporting ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Generating PDF...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Generate PDF Report
              </>
            )}
          </Button>
        </div>

        <div className="pt-4 border-t bg-blue-50 p-4 rounded-lg">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-blue-600 mt-0.5" />
            <div className="text-xs text-blue-700">
              <p className="font-medium mb-1">Professional PDF Reports Include:</p>
              <ul className="space-y-1 list-disc list-inside ml-2">
                <li>EduFam company branding, logo, and professional headers</li>
                <li>Real-time data from all schools and users in the network</li>
                <li>Well-formatted tables with proper styling and alignment</li>
                <li>Professional footer with page numbers and generation timestamp</li>
                <li>Summary statistics, insights, and visual data presentation</li>
                <li>Structured layout with clear sections and hierarchical information</li>
              </ul>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ReportExporter;
