"use client";

import React, { useState } from 'react';
import { Dictionary } from 'lodash';
import { DictionaryTable } from '../common/DictionaryTable';
import { BaseModal } from '../modals/BaseModal';

interface BatchViewerProps {
  linkedInProfile?: any;
  hubSpotVariables?: Record<string, string>;
  linkedInVarsExtra?: Record<string, string>;
  smartVariables?: Dictionary<string>;
  linkedInVariables?: Record<string, string>;
  systemVariables?: Record<string, string>;
}

const BATCH_DEFINITIONS = [
  {
    id: 1,
    name: 'LinkedIn Profile',
    description: 'Core LinkedIn profile information',
    color: 'bg-blue-500',
    hoverColor: 'hover:bg-blue-600'
  },
  {
    id: 2,
    name: 'Company Enrichment',
    description: 'Company data from CoreSignal',
    color: 'bg-green-500',
    hoverColor: 'hover:bg-green-600'
  },
  {
    id: 3,
    name: 'HubSpot Data',
    description: 'CRM contact and company data',
    color: 'bg-orange-500',
    hoverColor: 'hover:bg-orange-600'
  },
  {
    id: 4,
    name: 'LinkedIn Posts',
    description: 'Recent LinkedIn activity',
    color: 'bg-purple-500',
    hoverColor: 'hover:bg-purple-600'
  },
  {
    id: 5,
    name: 'LinkedIn Jobs',
    description: 'Job listings from company',
    color: 'bg-indigo-500',
    hoverColor: 'hover:bg-indigo-600'
  }
];

export const BatchViewer: React.FC<BatchViewerProps> = ({
  linkedInProfile,
  hubSpotVariables = {},
  linkedInVarsExtra = {},
  smartVariables = {},
  linkedInVariables = {},
  systemVariables = {}
}) => {
  const [selectedBatch, setSelectedBatch] = useState<number | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const getBatchData = (batchId: number): Record<string, string> => {
    switch (batchId) {
      case 1: // LinkedIn Profile (no guaranteed variable needed - base data)
        return {
          ...systemVariables,
          ...(linkedInProfile?.profile_data || {}),
          ...(linkedInVariables || {}),
        };
      
      case 2: // Company Enrichment  
        const enrichmentData: Record<string, string> = {};
        
        // Filter linkedInVarsExtra for company enrichment fields
        Object.entries(linkedInVarsExtra || {}).forEach(([key, value]) => {
          if (key.toLowerCase().includes('company_') || 
              key.toLowerCase().includes('industry') ||
              key.toLowerCase().includes('website') ||
              key.toLowerCase().includes('description') ||
              key.toLowerCase().includes('revenue') ||
              key.toLowerCase().includes('founded') ||
              key.toLowerCase().includes('employees')) {
            enrichmentData[key] = String(value);
          }
        });

        // Add guaranteed variable  
        enrichmentData.company_enrichment_guaranteed = Object.keys(enrichmentData).length > 0 ? 'complete' : 'no_data';
        return enrichmentData;
      
      case 3: // HubSpot Data
        const hubspotData = { ...hubSpotVariables };
        // Add guaranteed variable
        hubspotData.hubspot_guaranteed = Object.keys(hubSpotVariables).length > 0 ? 'complete' : 'no_data';
        return hubspotData;
      
      case 4: // LinkedIn Posts
        const postsData: Record<string, string> = {};
        
        // Filter smart variables for LinkedIn posts
        Object.entries(smartVariables || {}).forEach(([key, value]) => {
          if (key.toLowerCase().includes('linkedin_post') || key.toLowerCase().includes('post_')) {
            postsData[key] = String(value);
          }
        });

        // Add guaranteed variable
        postsData.linkedin_posts_guaranteed = Object.keys(postsData).length > 0 ? 'complete' : 'no_data';
        return postsData;
      
      case 5: // LinkedIn Jobs
        const jobsData: Record<string, string> = {};
        
        // Filter smart variables for LinkedIn jobs
        Object.entries(smartVariables || {}).forEach(([key, value]) => {
          if (key.toLowerCase().includes('linkedin_job') || key.toLowerCase().includes('job_')) {
            jobsData[key] = String(value);
          }
        });

        // Add guaranteed variable
        jobsData.linkedin_jobs_guaranteed = Object.keys(jobsData).length > 0 ? 'complete' : 'no_data';
        return jobsData;
      
      default:
        return {};
    }
  };

  const getBatchFieldCount = (batchId: number): number => {
    const data = getBatchData(batchId);
    // Don't count the guaranteed variable in the field count
    const fieldsWithoutGuaranteed = Object.fromEntries(
      Object.entries(data).filter(([key]) => !key.endsWith('_guaranteed'))
    );
    return Object.keys(fieldsWithoutGuaranteed).length;
  };

  const getBatchStatus = (batchId: number): 'complete' | 'no_data' | 'loading' => {
    const data = getBatchData(batchId);
    const guaranteedKey = Object.keys(data).find(key => key.endsWith('_guaranteed'));
    if (guaranteedKey) {
      return data[guaranteedKey] as 'complete' | 'no_data' | 'loading';
    }
    return 'no_data';
  };

  const handleBatchClick = (batchId: number) => {
    setSelectedBatch(batchId);
    setIsModalOpen(true);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'complete': return '✅';
      case 'loading': return '⏳';
      case 'no_data': return '❌';
      default: return '❓';
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4 bg-gray-50 rounded-lg">
      <div className="flex items-center gap-2">
        <h3 className="font-medium text-lg">Data Batches</h3>
        <span className="text-sm text-gray-600">(Click to view data)</span>
      </div>
      
      <div className="flex flex-wrap gap-3">
        {BATCH_DEFINITIONS.map((batch) => {
          const fieldCount = getBatchFieldCount(batch.id);
          const status = getBatchStatus(batch.id);
          const statusIcon = getStatusIcon(status);
          
          return (
            <button
              key={batch.id}
              onClick={() => handleBatchClick(batch.id)}
              className={`
                ${batch.color} ${batch.hoverColor} 
                text-white px-4 py-3 rounded-lg shadow-md transition-all duration-200
                flex flex-col items-center gap-1 min-w-[120px]
                hover:shadow-lg transform hover:-translate-y-0.5
              `}
            >
              <div className="flex items-center gap-2">
                <span className="font-bold text-xl">{batch.id}</span>
                <span className="text-lg">{statusIcon}</span>
              </div>
              <span className="text-sm font-medium text-center">{batch.name}</span>
              <span className="text-xs opacity-90">{fieldCount} fields</span>
            </button>
          );
        })}
      </div>

      <div className="text-sm text-gray-600">
        <p><strong>Legend:</strong> ✅ Data loaded • ⏳ Loading • ❌ No data</p>
      </div>

      <BaseModal 
        show={isModalOpen} 
        onClose={() => setIsModalOpen(false)}
      >
        {selectedBatch && (
          <div className="p-container flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className={`
                w-12 h-12 rounded-lg flex items-center justify-center text-white font-bold text-xl
                ${BATCH_DEFINITIONS.find(b => b.id === selectedBatch)?.color}
              `}>
                {selectedBatch}
              </div>
              <div>
                <h2 className="text-xl font-semibold">
                  Batch {selectedBatch}: {BATCH_DEFINITIONS.find(b => b.id === selectedBatch)?.name}
                </h2>
                <p className="text-gray-600">
                  {BATCH_DEFINITIONS.find(b => b.id === selectedBatch)?.description}
                </p>
              </div>
            </div>
            
            <DictionaryTable
              data={getBatchData(selectedBatch)}
              label={`Data fields in Batch ${selectedBatch}`}
            />
          </div>
        )}
      </BaseModal>
    </div>
  );
};