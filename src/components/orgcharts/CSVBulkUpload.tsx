"use client";

import React, { useState, useRef, ChangeEvent } from 'react';
import Papa from 'papaparse';
import { callBackend } from '@/hooks/networking';

interface CSVValidationError {
  message: string;
}

interface UploadError {
  row: number;
  message: string;
}

interface UploadResponse {
  success_count: number;
  created: number;
  company_id: number;
  errors: UploadError[];
}

interface BackendError {
  error: string;
  details?: string;
}

interface CSVBulkUploadProps {
  onUploadSuccess?: () => void;
}

// Frontend validation errors
const VALIDATION_ERRORS = {
  FILE_EXTENSION: "File must be a CSV (.csv extension required)",
  FILE_SIZE: "File size must be less than 5MB",
  FILE_TYPE: "Invalid file type. Please upload a CSV file",
  MISSING_HEADERS: "CSV must have required headers: 'name' and 'website' (optional: 'account_intel')",
  NO_DATA: "CSV is empty or contains no data rows",
  MISSING_WEBSITE: "Website is required for all rows",
};

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB in bytes
const REQUIRED_HEADERS = ['name', 'website'];

export const CSVBulkUpload: React.FC<CSVBulkUploadProps> = ({ onUploadSuccess }) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResponse | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset all state
  const resetState = () => {
    setSelectedFile(null);
    setValidationError(null);
    setUploadResult(null);
    setUploadError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Validate file before upload
  const validateFile = (file: File): string | null => {
    // Check file extension
    if (!file.name.toLowerCase().endsWith('.csv')) {
      return VALIDATION_ERRORS.FILE_EXTENSION;
    }

    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      return VALIDATION_ERRORS.FILE_SIZE;
    }

    // Check MIME type
    const validMimeTypes = ['text/csv', 'application/csv', 'text/plain'];
    if (!validMimeTypes.includes(file.type)) {
      return VALIDATION_ERRORS.FILE_TYPE;
    }

    return null;
  };

  // Parse and validate CSV headers and content
  const validateCSVContent = (file: File): Promise<string | null> => {
    return new Promise((resolve) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          // Check if we have headers
          if (!results.meta.fields || results.meta.fields.length === 0) {
            resolve(VALIDATION_ERRORS.MISSING_HEADERS);
            return;
          }

          // Normalize headers (trim whitespace and lowercase)
          const headers = results.meta.fields.map(h => h.trim().toLowerCase());
          
          // Check if required headers exist
          const hasRequiredHeaders = REQUIRED_HEADERS.every(required => 
            headers.includes(required.toLowerCase())
          );

          if (!hasRequiredHeaders) {
            resolve(VALIDATION_ERRORS.MISSING_HEADERS);
            return;
          }

          // Check if there's at least one data row
          if (!results.data || results.data.length === 0) {
            resolve(VALIDATION_ERRORS.NO_DATA);
            return;
          }

          // Validate that all rows have a non-empty website field
          const rowsWithMissingWebsite: number[] = [];
          results.data.forEach((row: any, index: number) => {
            const website = row.website || row.Website || '';
            if (!website.trim()) {
              rowsWithMissingWebsite.push(index + 2); // +2 because row 1 is header, index is 0-based
            }
          });

          if (rowsWithMissingWebsite.length > 0) {
            const rowNumbers = rowsWithMissingWebsite.slice(0, 5).join(', ');
            const moreRows = rowsWithMissingWebsite.length > 5 ? ` and ${rowsWithMissingWebsite.length - 5} more` : '';
            resolve(`${VALIDATION_ERRORS.MISSING_WEBSITE} (rows: ${rowNumbers}${moreRows})`);
            return;
          }

          resolve(null);
        },
        error: () => {
          resolve(VALIDATION_ERRORS.FILE_TYPE);
        }
      });
    });
  };

  // Handle file selection
  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    
    // Clear previous state
    setValidationError(null);
    setUploadResult(null);
    setUploadError(null);

    if (!file) {
      setSelectedFile(null);
      return;
    }

    // Validate file basic properties
    const basicValidationError = validateFile(file);
    if (basicValidationError) {
      setValidationError(basicValidationError);
      setSelectedFile(null);
      return;
    }

    // Validate CSV content
    const contentValidationError = await validateCSVContent(file);
    if (contentValidationError) {
      setValidationError(contentValidationError);
      setSelectedFile(null);
      return;
    }

    // File is valid
    setSelectedFile(file);
  };

  // Handle upload
  const handleUpload = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    setUploadError(null);
    setUploadResult(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      // IMPORTANT: Don't manually set Content-Type for multipart/form-data
      // Let axios/browser set it automatically with the correct boundary
      const response = await callBackend<FormData, UploadResponse>(
        'org-charts/bulk-upload/',
        {
          method: 'POST',
          data: formData,
          // Don't set Content-Type header - axios will set it automatically with boundary
        }
      );

      setUploadResult(response);
      
      // Call success callback if provided
      if (onUploadSuccess) {
        onUploadSuccess();
      }
    } catch (error: any) {
      console.error('CSV Bulk Upload Error:', error);

      // Handle error responses from backend
      const errorMessage = error?.response?.data?.error ||
                          error?.message ||
                          'An unexpected error occurred during upload';
      setUploadError(errorMessage);
    } finally {
      setIsUploading(false);
    }
  };

  const isUploadDisabled = !selectedFile || isUploading || !!validationError;

  return (
    <div className="mb-6 p-4 bg-green-50 rounded-lg border border-green-200">
      <h3 className="text-lg font-medium text-gray-900 mb-3">Bulk Upload Org Charts (CSV)</h3>
      
      <div className="space-y-4">
        {/* File Input Section */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select CSV File
          </label>
          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              disabled={isUploading}
              className="block w-full text-sm text-gray-900 border border-gray-300 rounded-lg cursor-pointer bg-white focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>
          
          {/* Show selected filename */}
          {selectedFile && (
            <p className="text-sm text-gray-600 mt-2">
              Selected: <span className="font-medium">{selectedFile.name}</span> 
              ({(selectedFile.size / 1024).toFixed(2)} KB)
            </p>
          )}

          {/* CSV Format Info */}
          <p className="text-xs text-gray-500 mt-2">
            CSV must have columns: "name" and "website" (both required). Optional: "account_intel" column for additional company information. Maximum file size: 5MB.
          </p>
        </div>

        {/* Validation Error */}
        {validationError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-800">
              <span className="font-medium">Validation Error:</span> {validationError}
            </p>
          </div>
        )}

        {/* Upload Error */}
        {uploadError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-800">
              <span className="font-medium">Upload Error:</span> {uploadError}
            </p>
          </div>
        )}

        {/* Upload Results */}
        {uploadResult && (
          <div className="space-y-3">
            {/* Success Message */}
            {uploadResult.created > 0 && (
              <div className="p-3 bg-green-100 border border-green-300 rounded-md">
                <p className="text-sm text-green-800 font-medium">
                  ✓ Successfully created {uploadResult.created} org chart{uploadResult.created !== 1 ? 's' : ''}
                </p>
              </div>
            )}

            {/* Errors List */}
            {uploadResult.errors && uploadResult.errors.length > 0 && (
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                <p className="text-sm text-yellow-900 font-medium mb-2">
                  Failed to create {uploadResult.errors.length} row{uploadResult.errors.length !== 1 ? 's' : ''}:
                </p>
                <ul className="text-sm text-yellow-800 space-y-1 list-disc list-inside">
                  {uploadResult.errors.map((error, index) => (
                    <li key={index}>
                      Row {error.row}: {error.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleUpload}
            disabled={isUploadDisabled}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center gap-2 transition-colors"
          >
            {isUploading && (
              <div className="animate-spin h-4 w-4 border-2 border-white rounded-full border-t-transparent"></div>
            )}
            {isUploading ? 'Uploading...' : 'Upload CSV'}
          </button>

          {/* Reset/Upload Another Button */}
          {(uploadResult || uploadError) && !isUploading && (
            <button
              onClick={resetState}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 text-sm transition-colors"
            >
              Upload Another File
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

