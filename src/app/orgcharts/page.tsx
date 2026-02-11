"use client";

import React from 'react';
import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useHubspotEmployees, useHubspotCompanySearch } from "@/hooks/useHubspot";
import { useBackendQuery, useBackendMutation, callBackend } from "@/hooks/networking";
import { EditOrgChartModal } from "@/components/modals/EditOrgChartModal";
import { DeleteConfirmationModal } from "@/components/modals/DeleteConfirmationModal";
import { BaseModal } from "@/components/modals/BaseModal";
import { CSVBulkUpload } from "@/components/orgcharts/CSVBulkUpload";

// Type for user profile
interface UserProfile {
  id: number;
}

// Backend API interfaces
interface OrgChartAPI {
  id: number;
  company: number; // Changed from account to company
  name: string;
  website?: string; // Add website field
  account_intel?: string; // Account intel is at the top level, not in metadata
  narrative?: string; // Narrative field acts as a title
  chart_data?: {
    version?: string;
    metadata?: {
      name?: string;
      created_at?: string;
      last_modified?: string;
    };
    root_node?: any;
    ai_metadata?: any;
  };
  created_at: string;
  updated_at: string;
}

interface CompanyInfo {
  id: string;
  name: string;
  industry?: string;
  size?: string;
  account_intel?: string;
}

interface OrgChartMetadata {
  id: string;
  name: string;
  companyInfo: CompanyInfo;
  created_at: string;
  last_modified: string;
  account_intel: string;
  version: string;
}

// Type definitions based on your JSON structure
interface ContactProperties {
  associatedcompanyid?: { value: string; label: string };
  call_objection?: { value: string; label: string };
  city?: { value: string; label: string };
  company?: { value: string; label: string };
  country?: { value: string; label: string };
  email?: { value: string; label: string };
  firstname?: { value: string; label: string };
  lastname?: { value: string; label: string };
  jobtitle?: { value: string; label: string };
  phone?: { value: string; label: string };
  state?: { value: string; label: string };
  linkedin_profile?: { value: string; label: string };
  lifecyclestage?: { value: string; label: string };
  leads_status?: { value: string; label: string };
  [key: string]: unknown;
}

interface Contact {
  id: string;
  created_at: string;
  updated_at: string;
  firstname: string;
  lastname: string;
  email: string;
  properties: ContactProperties;
}

// New interface for org chart nodes
interface OrgChartNode {
  id: string;
  contact: Contact;
  position: { x: number; y: number };
  level: number;
  parentId?: string; // Add explicit parent relationship
}

// Add new interfaces for hierarchical layout
interface HierarchicalNode extends OrgChartNode {
  children: HierarchicalNode[];
  parent?: HierarchicalNode;
  subtreeWidth?: number;
}

interface HierarchicalArrow {
  type: 'direct' | 'vertical' | 'horizontal' | 'T-connector';
  from: { x: number; y: number };
  to: { x: number; y: number };
  key: string;
  parent?: OrgChartNode;
  children?: OrgChartNode[];
}

// Constants for layout
const LEVEL_HEIGHT = 150; // Height between levels
const NODE_WIDTH = 200;
const NODE_HEIGHT = 80;

// Arrow type definition
interface Arrow {
  from: OrgChartNode;
  to: OrgChartNode;
  key: string;
}

// Layout configuration constants
const LAYOUT_CONFIG = {
  NODE_WIDTH: 200,
  NODE_HEIGHT: 80,
  LEVEL_HEIGHT: 150,
  HORIZONTAL_SPACING: 50, // Space between siblings
  MIN_PARENT_CHILD_SPACING: 30, // Minimum space between parent and children group
  SUBTREE_PADDING: 40 // Extra padding around subtrees
};

// Collision detection helper functions
const checkNodeCollision = (
  pos1: { x: number; y: number },
  pos2: { x: number; y: number },
  padding: number = 10
): boolean => {
  const nodeWidth = LAYOUT_CONFIG.NODE_WIDTH + padding;
  const nodeHeight = LAYOUT_CONFIG.NODE_HEIGHT + padding;
  
  return (
    pos1.x < pos2.x + nodeWidth &&
    pos1.x + nodeWidth > pos2.x &&
    pos1.y < pos2.y + nodeHeight &&
    pos1.y + nodeHeight > pos2.y
  );
};

const findNearestNonOverlappingPosition = (
  targetPosition: { x: number; y: number },
  existingNodes: OrgChartNode[],
  excludeNodeId?: string,
  preferredLevel?: number
): { x: number; y: number } => {
  const filteredNodes = existingNodes.filter(node => node.id !== excludeNodeId);
  const padding = 15; // Extra padding to ensure clear separation
  
  // If preferredLevel is specified, snap to that level
  let targetY = targetPosition.y;
  if (preferredLevel !== undefined) {
    targetY = preferredLevel * LAYOUT_CONFIG.LEVEL_HEIGHT;
  }
  
  let candidatePosition = { x: targetPosition.x, y: targetY };
  
  // Check if the target position collides with any existing node
  const hasCollision = () => 
    filteredNodes.some(node => checkNodeCollision(candidatePosition, node.position, padding));
  
  if (!hasCollision()) {
    return candidatePosition;
  }
  
  // Find the nearest non-overlapping position
  const maxAttempts = 50;
  const stepSize = LAYOUT_CONFIG.NODE_WIDTH + padding;
  
  // Try positions in expanding circles around the target
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Try positions to the right
    candidatePosition = { 
      x: targetPosition.x + (stepSize * attempt), 
      y: targetY 
    };
    if (!hasCollision()) {
      return candidatePosition;
    }
    
    // Try positions to the left (but ensure x >= 0)
    if (targetPosition.x - (stepSize * attempt) >= 0) {
      candidatePosition = { 
        x: targetPosition.x - (stepSize * attempt), 
        y: targetY 
      };
      if (!hasCollision()) {
        return candidatePosition;
      }
    }
    
    // If we're not locked to a specific level, try above and below
    if (preferredLevel === undefined) {
      // Try above
      if (targetPosition.y - (LAYOUT_CONFIG.LEVEL_HEIGHT * attempt) >= 0) {
        candidatePosition = { 
          x: targetPosition.x, 
          y: targetPosition.y - (LAYOUT_CONFIG.LEVEL_HEIGHT * attempt) 
        };
        if (!hasCollision()) {
          return candidatePosition;
        }
      }
      
      // Try below
      candidatePosition = { 
        x: targetPosition.x, 
        y: targetPosition.y + (LAYOUT_CONFIG.LEVEL_HEIGHT * attempt) 
      };
      if (!hasCollision()) {
        return candidatePosition;
      }
    }
  }
  
  // If all else fails, place it far to the right to avoid overlap
  const safeX = Math.max(
    targetPosition.x,
    filteredNodes.reduce((maxX, node) => Math.max(maxX, node.position.x + LAYOUT_CONFIG.NODE_WIDTH + padding), 0)
  );
  
  return { x: safeX, y: targetY };
};

// Component prop interfaces
interface ContactsListProps {
  contacts: Contact[];
  onContactSelect?: (contact: Contact) => void;
  selectedContact?: Contact | null;
  orgChartNodes: OrgChartNode[];
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
}

interface ContactItemProps {
  contact: Contact;
  isSelected: boolean;
  onClick: () => void;
  isInOrgChart: boolean;
}

interface OrgChartProps {
  nodes: OrgChartNode[];
  onNodeRemove: (nodeId: string) => void;
  onNodeMove: (nodeId: string, newPosition: { x: number; y: number }) => void;
  onNodeSelect?: (node: OrgChartNode) => void; // Add this
  onAutoLayout?: (newPositions: Record<string, { x: number; y: number }>) => void; // Add auto-layout callback
  onNodeAdd?: (node: OrgChartNode) => void; // Add node creation callback for drag and drop
  narrative?: string; // Narrative title to display above the org chart
}

interface ManualEntryPanelProps {
  onAddPerson: (personData: {
    firstName: string;
    lastName: string;
    jobTitle: string;
    email: string;
    level: number;
    parentId?: string;
  }) => void;
  maxLevel: number;
  availableParents: OrgChartNode[];
}

// Add new interface for the modal
interface NodeInfoModalProps {
  node: OrgChartNode | null;
  isOpen: boolean;
  onClose: () => void;
  onParentChange?: (nodeId: string, parentId: string | undefined) => void; // Add parent change callback
  availableParents?: OrgChartNode[]; // Add available parents
}

// Add new interfaces for the custom modals
interface AlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  type?: 'success' | 'error' | 'warning' | 'info';
}

interface PromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (value: string) => void;
  title: string;
  message: string;
  placeholder?: string;
  defaultValue?: string;
}

// ContactsList Component
const ContactsList: React.FC<ContactsListProps> = ({
  contacts,
  onContactSelect,
  selectedContact,
  orgChartNodes,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  // OPTIMIZED: Memoize filtered contacts to prevent recalculation on every render
  const filteredContacts = useMemo(() => {
    if (!searchTerm.trim()) return contacts;
    
    const searchLower = searchTerm.toLowerCase();
    return contacts.filter(contact => {
      const fullName = `${contact.firstname} ${contact.lastname}`.toLowerCase();
      const jobTitle = contact.properties?.jobtitle?.value?.toLowerCase() || '';
      const email = (contact.properties?.email?.value || contact.email).toLowerCase();

      return fullName.includes(searchLower) ||
        jobTitle.includes(searchLower) ||
        email.includes(searchLower);
    });
  }, [contacts, searchTerm]);

  const companyName = useMemo(() => {
    return contacts[0]?.properties?.company?.value || 'Company';
  }, [contacts]);

  // Check if contact is already in org chart - OPTIMIZED: Use Set for O(1) lookup instead of O(n)
  const orgChartContactIds = useMemo(() => {
    return new Set(orgChartNodes.map(node => node.contact.id));
  }, [orgChartNodes]);

  // OPTIMIZED: Memoize the isInOrgChart function
  const isInOrgChart = useCallback((contactId: string) => {
    return orgChartContactIds.has(contactId);
  }, [orgChartContactIds]);

  return (
    <div className="w-72 bg-white border-r border-gray-200 flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 bg-gray-50">
        <h2 className="text-lg font-semibold text-gray-900">{companyName}</h2>
        <p className="text-sm text-gray-600 mt-1">
          {contacts.length} employee{contacts.length !== 1 ? 's' : ''}
        </p>
        <p className="text-xs text-blue-600 mt-2">
          💡 Drag employees to the org chart →
        </p>
      </div>

      {/* Search Bar */}
      <div className="p-4 border-b border-gray-200">
        <input
          type="text"
          placeholder="Search employees..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {/* Contacts List */}
      <div className="flex-1 overflow-y-auto scroll-smooth scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
        {filteredContacts.length === 0 ? (
          <div className="p-4 text-center text-gray-500">
            <p>{searchTerm ? 'No employees match your search' : 'No employees found'}</p>
          </div>
        ) : (
          <>
            <div className="divide-y divide-gray-100">
              {filteredContacts.map((contact) => (
                <ContactItem
                  key={contact.id}
                  contact={contact}
                  isSelected={selectedContact?.id === contact.id}
                  onClick={() => onContactSelect?.(contact)}
                  isInOrgChart={isInOrgChart(contact.id)}
                />
              ))}
            </div>
            
            {/* Load More Button */}
            {hasMore && onLoadMore && (
              <div className="p-4 border-t border-gray-200">
                <button
                  onClick={onLoadMore}
                  disabled={isLoadingMore}
                  className="w-full px-4 py-3 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                  {isLoadingMore ? "Loading..." : `Load More (100)`}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

// ContactItem Component - OPTIMIZED with React.memo to prevent unnecessary re-renders
const ContactItem: React.FC<ContactItemProps> = React.memo(({ contact, isSelected, onClick, isInOrgChart }) => {
  const fullName = `${contact.firstname} ${contact.lastname}`.trim();
  const jobTitle = contact.properties?.jobtitle?.value || '';
  const email = contact.properties?.email?.value || contact.email;
  const location = [
    contact.properties?.city?.value,
    contact.properties?.state?.value || contact.properties?.country?.value
  ].filter(Boolean).join(', ');

  const lifecycleStage = contact.properties?.lifecyclestage?.value;
  const leadsStatus = contact.properties?.leads_status?.value;

  // Status indicator color - OPTIMIZED: Memoize the function
  const statusColor = useMemo(() => {
    if (leadsStatus === 'Open Deal') return 'bg-green-100 text-green-800';
    if (lifecycleStage === 'opportunity') return 'bg-blue-100 text-blue-800';
    if (lifecycleStage === 'lead') return 'bg-yellow-100 text-yellow-800';
    return 'bg-gray-100 text-gray-800';
  }, [leadsStatus, lifecycleStage]);

  // OPTIMIZED: Memoize drag handler to prevent recreation on every render
  const handleDragStart = useCallback((e: React.DragEvent) => {
    e.stopPropagation();
    e.dataTransfer.setData('application/json', JSON.stringify(contact));
    e.dataTransfer.setData('text/plain', 'contact-drop');
    const img = new Image();
    img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAUEBAAAACwAAAAAAQABAAACAkQBADs=';
    e.dataTransfer.setDragImage(img, 0, 0);
    e.dataTransfer.effectAllowed = 'copy';
  }, [contact]);

  return (
    <div
      className={`p-4 cursor-pointer transition-all duration-150 ease-out ${isSelected ? 'bg-blue-50 border-r-2 border-blue-500' : 'hover:bg-gray-50'} ${isInOrgChart ? 'opacity-60 bg-green-50' : ''}`}
      onClick={onClick}
      draggable={!isInOrgChart}
      onDragStart={handleDragStart}
    >
      <div className="flex items-start space-x-3">
        {/* Avatar */}
        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-medium text-sm ${isInOrgChart ? 'bg-green-500' : 'bg-blue-500'
          }`}>
          {fullName.split(' ').map(n => n[0]).join('').toUpperCase()}
        </div>

        {/* Contact Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-900 truncate">
              {fullName}
              {isInOrgChart && <span className="ml-2 text-xs text-green-600">✓ In Chart</span>}
            </h3>
            {leadsStatus && (
              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${statusColor}`}>
                {leadsStatus}
              </span>
            )}
          </div>

          {jobTitle && (
            <p className="text-sm text-gray-600 truncate mt-1">
              {jobTitle}
            </p>
          )}

          <p className="text-xs text-gray-500 truncate mt-1">
            {email}
          </p>

          {location && (
            <p className="text-xs text-gray-400 truncate mt-1">
              📍 {location}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function for React.memo - only re-render if meaningful props change
  // We ignore onClick comparison since it's recreated but functionally equivalent per contact
  return (
    prevProps.contact.id === nextProps.contact.id &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.isInOrgChart === nextProps.isInOrgChart
    // onClick is ignored - function reference changes but behavior is same for same contact
  );
});

ContactItem.displayName = 'ContactItem';

// NodeInfoModal Component
const NodeInfoModal: React.FC<NodeInfoModalProps> = ({ node, isOpen, onClose, onParentChange, availableParents }) => {
  if (!isOpen || !node) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Get current parent
  const currentParent = availableParents?.find(parent => parent.id === node.parentId);
  
  // Get potential parents (nodes at lower levels, excluding self and descendants)
  const potentialParents = availableParents?.filter(potential => 
    potential.id !== node.id && 
    potential.level < node.level &&
    potential.parentId !== node.id // Don't include nodes that are children of this node
  ) || [];

  const handleParentSelection = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newParentId = e.target.value || undefined;
    onParentChange?.(node.id, newParentId);
  };

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={handleBackdropClick}
    >
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 max-h-[80vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-800">Employee Details</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl font-bold"
          >
            ×
          </button>
        </div>
        
        <div className="space-y-4">
          {/* Basic Info */}
          <div>
            <h3 className="font-semibold text-gray-700 mb-2">Basic Information</h3>
            <div className="space-y-2 text-sm">
              <div>
                <span className="font-medium">Name:</span> {node.contact.firstname} {node.contact.lastname}
              </div>
              <div>
                <span className="font-medium">Email:</span> {node.contact.email}
              </div>
              <div>
                <span className="font-medium">Level:</span> {node.level}
              </div>
            </div>
          </div>

          {/* Parent Selection */}
          <div>
            <h3 className="font-semibold text-gray-700 mb-2">Reporting Structure</h3>
            <div className="space-y-2">
              <div>
                <label htmlFor="parent-select" className="block text-sm font-medium text-gray-700 mb-1">
                  Reports To:
                </label>
                <select
                  id="parent-select"
                  value={node.parentId || ''}
                  onChange={handleParentSelection}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">No Parent (Root Level)</option>
                  {potentialParents.map(parent => (
                    <option key={parent.id} value={parent.id}>
                      {parent.contact.firstname} {parent.contact.lastname} 
                      {parent.contact.properties?.jobtitle?.value ? ` - ${parent.contact.properties.jobtitle.value}` : ''}
                      {` (Level ${parent.level})`}
                    </option>
                  ))}
                </select>
              </div>
              {currentParent && (
                <div className="text-sm text-gray-600">
                  Currently reports to: <span className="font-medium">
                    {currentParent.contact.firstname} {currentParent.contact.lastname}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Contact Properties */}
          {node.contact.properties && (
            <div>
              <h3 className="font-semibold text-gray-700 mb-2">Professional Details</h3>
              <div className="space-y-2 text-sm">
                {node.contact.properties.jobtitle?.value && (
                  <div>
                    <span className="font-medium">Job Title:</span> {node.contact.properties.jobtitle.value}
                  </div>
                )}
                {node.contact.properties.company?.value && (
                  <div>
                    <span className="font-medium">Company:</span> {node.contact.properties.company.value}
                  </div>
                )}
                {node.contact.properties.phone?.value && (
                  <div>
                    <span className="font-medium">Phone:</span> {node.contact.properties.phone.value}
                  </div>
                )}
                {node.contact.properties.linkedin_profile?.value && (
                  <div>
                    <span className="font-medium">LinkedIn:</span>{' '}
                    <a 
                      href={node.contact.properties.linkedin_profile.value} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      View Profile
                    </a>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        
        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// Custom Alert Modal Component
const AlertModal: React.FC<AlertModalProps> = ({ 
  isOpen, 
  onClose, 
  title, 
  message, 
  type = 'info' 
}) => {
  if (!isOpen) return null;

  const getTypeStyles = () => {
    switch (type) {
      case 'success':
        return {
          icon: '✅',
          iconBg: 'bg-green-100',
          iconColor: 'text-green-600',
          buttonBg: 'bg-green-600 hover:bg-green-700',
          borderColor: 'border-green-200'
        };
      case 'error':
        return {
          icon: '❌',
          iconBg: 'bg-red-100',
          iconColor: 'text-red-600',
          buttonBg: 'bg-red-600 hover:bg-red-700',
          borderColor: 'border-red-200'
        };
      case 'warning':
        return {
          icon: '⚠️',
          iconBg: 'bg-yellow-100',
          iconColor: 'text-yellow-600',
          buttonBg: 'bg-yellow-600 hover:bg-yellow-700',
          borderColor: 'border-yellow-200'
        };
      default:
        return {
          icon: 'ℹ️',
          iconBg: 'bg-blue-100',
          iconColor: 'text-blue-600',
          buttonBg: 'bg-blue-600 hover:bg-blue-700',
          borderColor: 'border-blue-200'
        };
    }
  };

  const styles = getTypeStyles();

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={handleBackdropClick}
    >
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        {/* Header */}
        <div className={`flex items-center space-x-3 p-6 border-b ${styles.borderColor}`}>
          <div className={`w-10 h-10 ${styles.iconBg} rounded-full flex items-center justify-center`}>
            <span className="text-lg">{styles.icon}</span>
          </div>
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        </div>

        {/* Content */}
        <div className="p-6">
          <p className="text-gray-700 leading-relaxed">{message}</p>
        </div>

        {/* Footer */}
        <div className="flex justify-end p-6 border-t border-gray-200 bg-gray-50 rounded-b-lg">
          <button
            onClick={onClose}
            className={`px-4 py-2 text-white rounded-md text-sm font-medium transition-colors ${styles.buttonBg} focus:outline-none focus:ring-2 focus:ring-offset-2`}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
};

// Custom Prompt Modal Component
const PromptModal: React.FC<PromptModalProps> = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title, 
  message, 
  placeholder = '',
  defaultValue = ''
}) => {
  const [inputValue, setInputValue] = useState(defaultValue);

  useEffect(() => {
    setInputValue(defaultValue);
  }, [defaultValue, isOpen]);

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleConfirm = () => {
    if (inputValue.trim()) {
      onConfirm(inputValue.trim());
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleConfirm();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={handleBackdropClick}
    >
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        {/* Header */}
        <div className="flex items-center space-x-3 p-6 border-b border-blue-200">
          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
            <span className="text-lg">📝</span>
          </div>
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <p className="text-gray-700 leading-relaxed">{message}</p>
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder={placeholder}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            autoFocus
          />
        </div>

        {/* Footer */}
        <div className="flex justify-end space-x-3 p-6 border-t border-gray-200 bg-gray-50 rounded-b-lg">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!inputValue.trim()}
            className="px-4 py-2 text-white bg-blue-600 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
};

// OrgChart Component
const OrgChart: React.FC<OrgChartProps> = ({ nodes, onNodeRemove, onNodeMove, onNodeSelect, onAutoLayout, onNodeAdd, narrative }) => {
  const [draggedNode, setDraggedNode] = useState<string | null>(null);
  const [localNodePositions, setLocalNodePositions] = useState<Record<string, { x: number; y: number }>>({});
  const [showAutoLayoutButton, setShowAutoLayoutButton] = useState(false);
  const dragTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const dragCounterRef = useRef(0);
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Pan and Zoom state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const LEVEL_HEIGHT = 150; // Height between levels

  // Check if auto-layout would be beneficial (more than 3 nodes with potential parent-child relationships)
  useEffect(() => {
    const nodesByLevel = nodes.reduce((acc, node) => {
      if (!acc[node.level]) acc[node.level] = [];
      acc[node.level].push(node);
      return acc;
    }, {} as Record<number, OrgChartNode[]>);
    
    const hasMultipleNodes = nodes.length > 2;
    const hasMultipleLevels = Object.keys(nodesByLevel).length > 1;
    const hasParentsWithMultipleChildren = Object.values(nodesByLevel).some((levelNodes, index) => {
      const nextLevel = Object.values(nodesByLevel)[index + 1];
      return nextLevel && levelNodes.length > 0 && nextLevel.length > 1;
    });
    
    setShowAutoLayoutButton(hasMultipleNodes && hasMultipleLevels && hasParentsWithMultipleChildren);
  }, [nodes]);

  // Initialize local positions when nodes change
  useEffect(() => {
    const positions: Record<string, { x: number; y: number }> = {};
    nodes.forEach(node => {
      positions[node.id] = node.position;
    });
    setLocalNodePositions(positions);
  }, [nodes]);

  // Function to apply auto-layout
  const applyAutoLayout = () => {
    const hierarchy = buildHierarchy(nodes);
    const optimalPositions = calculateOptimalLayout(hierarchy, nodes);
    
    console.log('🔄 Applying auto-layout:', {
      hierarchyCount: hierarchy.length,
      optimalPositions: Object.keys(optimalPositions).length,
      hierarchy: hierarchy.map(h => ({
        id: h.id,
        name: `${h.contact.firstname} ${h.contact.lastname}`,
        childrenCount: h.children.length,
        subtreeWidth: h.subtreeWidth
      }))
    });
    
    // Use the callback to update positions without triggering level changes
    if (onAutoLayout) {
      onAutoLayout(optimalPositions);
    }
  };

  const handleNodeDragStart = (e: React.DragEvent, nodeId: string) => {
    console.log('🔄 Node drag start:', {
      nodeId,
      nodeName: nodes.find(n => n.id === nodeId)?.contact.firstname + ' ' + nodes.find(n => n.id === nodeId)?.contact.lastname
    });
    
    e.stopPropagation(); // Prevent event bubbling
    setDraggedNode(nodeId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', 'node-move'); // Different data type
    dragCounterRef.current = 0;
    
    // Calculate the offset from where the user grabbed the node
    const nodeElement = e.currentTarget as HTMLElement;
    const rect = nodeElement.getBoundingClientRect();
    
    // Store offset in content space (accounting for zoom and pan)
    dragOffsetRef.current = {
      x: (e.clientX - rect.left) / zoom,
      y: (e.clientY - rect.top) / zoom
    };
    
    // Create a custom drag image that respects the current zoom level
    const dragImage = nodeElement.cloneNode(true) as HTMLElement;
    dragImage.style.position = 'absolute';
    dragImage.style.top = '-9999px';
    dragImage.style.left = '-9999px';
    dragImage.style.width = `${rect.width}px`;
    dragImage.style.height = `${rect.height}px`;
    dragImage.style.transform = `scale(${zoom})`;
    dragImage.style.transformOrigin = '0 0';
    dragImage.style.pointerEvents = 'none';
    document.body.appendChild(dragImage);
    
    // Set the custom drag image with the offset accounting for zoom
    const offsetX = (e.clientX - rect.left);
    const offsetY = (e.clientY - rect.top);
    e.dataTransfer.setDragImage(dragImage, offsetX, offsetY);
    
    // Clean up the temporary drag image after a short delay
    setTimeout(() => {
      document.body.removeChild(dragImage);
    }, 0);
    
    console.log('✅ Node drag started successfully with offset:', dragOffsetRef.current);
  };

  // Remove the unreliable handleNodeDrag function and move position tracking to dragOver

  const handleNodeDragEnd = (nodeId: string) => {
    console.log('🏁 Node drag end - detailed debug:', { 
      nodeId,
      draggedNode,
      localNodePositions: localNodePositions[nodeId],
      allLocalPositions: localNodePositions
    });
    
    setDraggedNode(null);

    // Final position update
    if (dragTimeoutRef.current) {
      console.log('⏰ Clearing existing drag timeout');
      clearTimeout(dragTimeoutRef.current);
    }

    const finalPosition = localNodePositions[nodeId];
    console.log('🔍 Final position lookup:', {
      nodeId,
      finalPosition,
      localNodePositionsKeys: Object.keys(localNodePositions),
      localNodePositionsValues: Object.values(localNodePositions)
    });

    if (finalPosition) {
      console.log('📍 Final position update executing:', { 
        nodeId, 
        finalPosition,
        calculatedLevel: Math.floor(finalPosition.y / 150)
      });
      onNodeMove(nodeId, finalPosition);
    } else {
      console.warn('⚠️ No final position found for node:', {
        nodeId,
        availablePositions: Object.keys(localNodePositions),
        localNodePositions
      });
    }
    
    console.log('✅ Node drag ended successfully');
  };

const handleChartDrop = (e: React.DragEvent) => {
  console.log('📦 Chart drop event triggered:', {
    clientX: e.clientX,
    clientY: e.clientY,
    dataTransferTypes: Array.from(e.dataTransfer.types)
  });
  
  e.preventDefault();
  e.stopPropagation();
  
  // Only handle contact drops here, let node moves be handled elsewhere
  const isContactDrop = e.dataTransfer.getData('text/plain') === 'contact-drop';
  
  if (!isContactDrop) {
    console.log('🔄 Not a contact drop, skipping...');
    return;
  }
  
  // Check if this is a contact being dropped (not a node being moved)
  const contactData = e.dataTransfer.getData('application/json');
  console.log('📄 Contact data from drag:', contactData ? 'Found' : 'Not found');
  
  if (!contactData) {
    console.warn('⚠️ No contact data found in drop event');
    return;
  }
  
  try {
    const contact: Contact = JSON.parse(contactData);
    console.log('✅ Successfully parsed contact:', {
      contactName: `${contact.firstname} ${contact.lastname}`,
      contactId: contact.id
    });

    // Check if contact is already in org chart
    if (nodes.some(node => node.contact.id === contact.id)) {
      console.warn('⚠️ Contact already in org chart:', contact.id);
      return;
    }

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    // Account for zoom and pan transformations
    // rect already includes pan offset, so just convert from screen to content space
    const rawX = (e.clientX - rect.left) / zoom;
    const rawY = (e.clientY - rect.top) / zoom;

    // Apply level snapping (same logic as drag over)
    const freeformLevel = rawY / LEVEL_HEIGHT;
    const closestLevel = Math.max(0, Math.min(4, Math.round(freeformLevel))); // Clamp to 0-4
    const snappedY = closestLevel * LEVEL_HEIGHT;

    const initialX = Math.max(0, rawX - NODE_WIDTH / 2); // X remains freeform
    const initialY = snappedY; // Y snaps to level

    console.log('📍 Chart drop - level snapping calculation:', {
      rect,
      rawX, rawY,
      freeformLevel,
      closestLevel,
      snappedY,
      initialX, 
      initialY,
      NODE_WIDTH, 
      NODE_HEIGHT, 
      LEVEL_HEIGHT
    });

    // Find non-overlapping position using collision detection
    const finalPosition = findNearestNonOverlappingPosition(
      { x: initialX, y: initialY },
      nodes,
      undefined,
      closestLevel
    );

    console.log('🎯 Chart collision detection result:', {
      initialPosition: { x: initialX, y: initialY },
      finalPosition,
      adjustmentMade: initialX !== finalPosition.x || initialY !== finalPosition.y
    });

    const newNode: OrgChartNode = {
      id: `node-${contact.id}`,
      contact,
      position: finalPosition,
      level: closestLevel // Use calculated level directly
    };

    console.log('🆕 Creating new node from chart drop:', newNode);

    // Call the parent handler to add the node
    if (onNodeAdd) {
      onNodeAdd(newNode);
    }
    
    console.log('✅ Chart drop - node creation delegated successfully');
  } catch (error) {
    console.error('❌ Error parsing dropped contact data:', error);
  }
};

const handleChartDragOver = (e: React.DragEvent) => {
  e.preventDefault();
  e.stopPropagation();
  e.dataTransfer.dropEffect = 'copy';

  // If we're dragging a node (not a contact), track its position
  if (draggedNode) {
    // Throttle updates - only update every 3rd event
    dragCounterRef.current++;
    if (dragCounterRef.current % 3 !== 0) return;

    console.log('🔄 Tracking node position via dragOver:', {
      draggedNode,
      clientX: e.clientX,
      clientY: e.clientY,
      dragCounter: dragCounterRef.current
    });

    const containerRect = e.currentTarget.getBoundingClientRect();
    console.log('📦 Container rect from dragOver:', {
      left: containerRect.left,
      top: containerRect.top,
      width: containerRect.width,
      height: containerRect.height
    });

    // Account for zoom and pan transformations
    // containerRect already includes pan offset, so just convert from screen to content space
    const rawX = (e.clientX - containerRect.left) / zoom;
    const rawY = (e.clientY - containerRect.top) / zoom;
    
    // Calculate which level is closest (snap to 5 levels: 0, 1, 2, 3, 4)
    // Use the drag offset to position the node correctly relative to cursor
    const freeformLevel = (rawY - dragOffsetRef.current.y) / LEVEL_HEIGHT;
    const closestLevel = Math.max(0, Math.min(4, Math.round(freeformLevel))); // Clamp to 0-4
    const snappedY = closestLevel * LEVEL_HEIGHT;
    
    const newPosition = {
      x: Math.max(0, rawX - dragOffsetRef.current.x - boundingBox.offsetX), // Use actual grab offset
      y: snappedY // Y snaps to level
    };

    console.log('📍 Level snapping calculation:', {
      clientX: e.clientX,
      clientY: e.clientY,
      containerLeft: containerRect.left,
      containerTop: containerRect.top,
      rawX: rawX,
      rawY: rawY,
      freeformLevel: freeformLevel,
      closestLevel: closestLevel,
      snappedY: snappedY,
      finalX: newPosition.x,
      finalY: newPosition.y,
      LEVEL_HEIGHT: LEVEL_HEIGHT
    });

    // Update local position immediately for smooth visual feedback
    setLocalNodePositions(prev => {
      const updated = {
        ...prev,
        [draggedNode]: newPosition
      };
      console.log('🔄 Local positions updated with snapping:', {
        draggedNode,
        newPosition,
        snappedToLevel: closestLevel
      });
      return updated;
    });

    // Debounce the actual state update to parent
    if (dragTimeoutRef.current) {
      clearTimeout(dragTimeoutRef.current);
    }

    dragTimeoutRef.current = setTimeout(() => {
      console.log('⏰ Debounced position update with snapping:', { 
        draggedNode, 
        newPosition,
        level: closestLevel
      });
      onNodeMove(draggedNode, newPosition);
    }, 50); // 50ms debounce
  } else {
    console.log('👆 Chart drag over (contact):', {
      clientX: e.clientX,
      clientY: e.clientY
    });
  }
};



  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (dragTimeoutRef.current) {
        clearTimeout(dragTimeoutRef.current);
      }
    };
  }, []);

  // Attach native wheel event listener with passive: false to handle zoom
  // This must be done at the native level to properly prevent browser zoom
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const wheelHandler = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        
        // Perform zoom logic here at native level
        const delta = e.deltaY;
        const zoomFactor = 0.001;
        const currentZoom = zoom;
        const newZoom = Math.max(0.1, Math.min(3, currentZoom - delta * zoomFactor));
        
        // Get cursor position relative to container
        const rect = container.getBoundingClientRect();
        const cursorX = e.clientX - rect.left;
        const cursorY = e.clientY - rect.top;
        
        // Calculate the point in the content that the cursor is over
        const contentX = (cursorX - pan.x) / currentZoom;
        const contentY = (cursorY - pan.y) / currentZoom;
        
        // Calculate new pan to keep the content point under the cursor
        const newPanX = cursorX - contentX * newZoom;
        const newPanY = cursorY - contentY * newZoom;
        
        setZoom(newZoom);
        setPan({ x: newPanX, y: newPanY });
      }
    };

    // Add listener with passive: false to allow preventDefault
    container.addEventListener('wheel', wheelHandler, { passive: false });

    return () => {
      container.removeEventListener('wheel', wheelHandler);
    };
  }, [zoom, pan]); // Include zoom and pan in dependencies to get current values

  // Pan handlers - using mouse drag on background
  const handleMouseDown = (e: React.MouseEvent) => {
    // Only start panning if clicking on the background (not on a node)
    if ((e.target as HTMLElement).closest('.org-chart-node')) {
      return;
    }
    
    // Middle mouse button or Space + left click for panning
    if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
      e.preventDefault();
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y
      });
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  // Reset zoom and pan
  const handleResetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Memoize bounding box calculation first
  const boundingBox = useMemo(() => {
    if (nodes.length === 0) {
      return { width: 800, height: 600, offsetX: 0, offsetY: 0, minX: 0, minY: 0, maxX: 800, maxY: 600 };
    }
    
    const padding = 100;
    const extraBottomSpace = 300; // Additional space at the bottom for scrolling
    const nodeWidth = 200;
    const nodeHeight = 80;
    
    const minX = Math.min(...nodes.map(n => n.position.x)) - padding;
    const maxX = Math.max(...nodes.map(n => n.position.x)) + nodeWidth + padding;
    const minY = Math.min(...nodes.map(n => n.position.y)) - padding;
    const maxY = Math.max(...nodes.map(n => n.position.y)) + nodeHeight + padding + extraBottomSpace;
    
    return {
      width: Math.max(800, maxX - minX),
      height: Math.max(600, maxY - minY),
      offsetX: Math.max(0, -minX),
      offsetY: Math.max(0, -minY),
      minX,
      minY,
      maxX,
      maxY
    };
  }, [nodes]);

  // Memoize arrow generation using hierarchical structure
  const arrows = useMemo((): HierarchicalArrow[] => {
    if (nodes.length === 0) return [];
    
    // Build hierarchy with explicit parent relationships
    const hierarchy = buildHierarchy(nodes);
    
    // Use current node positions or local positions if dragging
    const effectivePositions: Record<string, { x: number; y: number }> = {};
    nodes.forEach(node => {
      const position = draggedNode === node.id 
        ? (localNodePositions[node.id] || node.position)
        : node.position;
      effectivePositions[node.id] = position;
    });
    
    // Generate arrows using the sophisticated T-connector system
    return generateHierarchicalArrows(hierarchy, effectivePositions, boundingBox);
  }, [nodes, localNodePositions, draggedNode, boundingBox]);

  // Memoize level lines generation - limit to 5 levels for snapping
  const levelLines = useMemo(() => {
    const lines = [];
    
    // Only show 5 levels (0, 1, 2, 3, 4) to match snapping behavior
    for (let level = 0; level <= 4; level++) {
      const y = level * LEVEL_HEIGHT + boundingBox.offsetY;
      lines.push({
        level,
        y,
        key: `level-${level}`,
        isDragTarget: !!draggedNode // Highlight during drag
      });
    }

    return lines;
  }, [boundingBox.offsetY, draggedNode]);

  return (
    <div 
    ref={containerRef}
    className="org-chart-container relative w-full h-full bg-gray-50 overflow-hidden"
    onMouseDown={handleMouseDown}
    onMouseMove={handleMouseMove}
    onMouseUp={handleMouseUp}
    onMouseLeave={handleMouseUp}
    style={{ 
      cursor: isPanning ? 'grabbing' : 'grab'
    }}
    >
      {/* Control buttons */}
      <div className="absolute top-4 right-4 z-20 flex gap-2">
        {/* Auto-layout button */}
        {showAutoLayoutButton && (
          <button
            onClick={() => {
              if (onAutoLayout) {
                const hierarchy = buildHierarchy(nodes);
                const optimalPositions = calculateOptimalLayout(hierarchy, nodes);
                onAutoLayout(optimalPositions);
              }
            }}
            className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 text-sm font-medium shadow-lg flex items-center gap-2 transition-all"
          >
            <span>🎯</span>
            Auto-Organize Chart
          </button>
        )}
        
        {/* Zoom controls */}
        <div className="flex flex-col gap-1 bg-white rounded-md shadow-lg p-1">
          <button
            onClick={() => {
              const newZoom = Math.min(3, zoom * 1.2);
              if (containerRef.current) {
                const rect = containerRef.current.getBoundingClientRect();
                const centerX = rect.width / 2;
                const centerY = rect.height / 2;
                const contentX = (centerX - pan.x) / zoom;
                const contentY = (centerY - pan.y) / zoom;
                const newPanX = centerX - contentX * newZoom;
                const newPanY = centerY - contentY * newZoom;
                setPan({ x: newPanX, y: newPanY });
              }
              setZoom(newZoom);
            }}
            className="px-3 py-1 hover:bg-gray-100 rounded text-sm font-medium"
            title="Zoom In (Ctrl + Scroll)"
          >
            +
          </button>
          <button
            onClick={handleResetView}
            className="px-2 py-1 hover:bg-gray-100 rounded text-xs"
            title="Reset View"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            onClick={() => {
              const newZoom = Math.max(0.1, zoom / 1.2);
              if (containerRef.current) {
                const rect = containerRef.current.getBoundingClientRect();
                const centerX = rect.width / 2;
                const centerY = rect.height / 2;
                const contentX = (centerX - pan.x) / zoom;
                const contentY = (centerY - pan.y) / zoom;
                const newPanX = centerX - contentX * newZoom;
                const newPanY = centerY - contentY * newZoom;
                setPan({ x: newPanX, y: newPanY });
              }
              setZoom(newZoom);
            }}
            className="px-3 py-1 hover:bg-gray-100 rounded text-sm font-medium"
            title="Zoom Out (Ctrl + Scroll)"
          >
            −
          </button>
        </div>
      </div>

      {/* Pan instruction hint */}
      <div className="absolute bottom-4 left-4 z-20 bg-white/90 rounded-md shadow-lg px-3 py-2 text-xs text-gray-600">
        <div>🔍 <strong>Ctrl + Scroll</strong> to zoom</div>
        <div>✋ <strong>Shift + Drag</strong> to pan</div>
      </div>

      {/* Narrative Title - displayed inside the white chart area at the top */}
      {narrative && (
        <div
          className="absolute pointer-events-none"
          style={{
            left: 20,
            top: 20,
            zIndex: 25,
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            padding: '8px 16px',
            borderRadius: '8px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            maxWidth: 'calc(100% - 40px)',
          }}
        >
          <h2 className="text-2xl font-bold text-gray-800 truncate">
            {narrative}
          </h2>
        </div>
      )}

      {/* Scrollable content area with zoom and pan transforms */}
      <div
        className="relative bg-white"
        onDrop={handleChartDrop}
        onDragOver={handleChartDragOver}
        style={{
          width: boundingBox.width,
          height: boundingBox.height,
          minWidth: '100%',
          minHeight: '100%',
          transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
          transformOrigin: '0 0',
          transition: isPanning ? 'none' : 'transform 0.1s ease-out'
        }}
      >
        {/* Render level background lines */}
        <svg
          className="absolute pointer-events-none"
          style={{
            width: '100%',
            height: boundingBox.height,
            zIndex: 0
          }}
        >
          {levelLines.map(line => (
            <g key={line.key}>
              {/* Horizontal level line */}
              <line
                x1={0}
                y1={line.y + 40} // Offset to center of where nodes would be
                x2={10000} // Extend across full editor width
                y2={line.y + 40}
                stroke={line.isDragTarget ? "#3B82F6" : "#E5E7EB"}
                strokeWidth={line.isDragTarget ? "3" : "1"}
                strokeDasharray={line.isDragTarget ? "10,5" : "5,5"}
                opacity={line.isDragTarget ? "0.9" : "0.6"}
              />
              {/* Level label */}
              <text
                x={20}
                y={line.y + 35}
                fill={line.isDragTarget ? "#1D4ED8" : "#9CA3AF"}
                fontSize={line.isDragTarget ? "14" : "12"}
                fontFamily="system-ui"
                fontWeight={line.isDragTarget ? "600" : "400"}
              >
                Level {line.level} {line.isDragTarget ? '📌' : ''}
              </text>
              
              {/* Drop zone highlight during drag */}
              {line.isDragTarget && (
                <rect
                  x={0}
                  y={line.y}
                  width="100%"
                  height={80} // NODE_HEIGHT
                  fill="#3B82F6"
                  opacity="0.1"
                  pointerEvents="none"
                />
              )}
            </g>
          ))}
        </svg>

        {/* Render hierarchical arrows - only when not dragging for better performance */}
        {draggedNode === null && (
          <svg
            className="absolute pointer-events-none"
            style={{
              width: boundingBox.width,
              height: boundingBox.height,
              zIndex: 1
            }}
          >
            <defs>
              {/* Arrow marker for hierarchical arrows */}
              <marker
                id="hierarchical-arrowhead"
                markerWidth="10"
                markerHeight="7"
                refX="9"
                refY="3.5"
                orient="auto"
              >
                <polygon
                  points="0 0, 10 3.5, 0 7"
                  fill="#4F46E5"
                />
              </marker>
            </defs>
            
            {arrows.map(arrow => {
              const getStrokeStyle = () => {
                switch (arrow.type) {
                  case 'direct':
                    return { stroke: "#4F46E5", strokeWidth: "2", markerEnd: "url(#hierarchical-arrowhead)" };
                  case 'vertical':
                    return { stroke: "#6366F1", strokeWidth: "2" };
                  case 'horizontal':
                    return { stroke: "#6366F1", strokeWidth: "2" };
                  case 'T-connector':
                    return { stroke: "#6366F1", strokeWidth: "2", markerEnd: "url(#hierarchical-arrowhead)" };
                  default:
                    return { stroke: "#6B7280", strokeWidth: "1" };
                }
              };

              const strokeStyle = getStrokeStyle();

              return (
                <line
                  key={arrow.key}
                  x1={arrow.from.x}
                  y1={arrow.from.y}
                  x2={arrow.to.x}
                  y2={arrow.to.y}
                  {...strokeStyle}
                />
              );
            })}
          </svg>
        )}

        {/* Render nodes with optimized positioning */}
        {nodes.map(node => {
          // Use local position if dragging this node, otherwise use node position
          const position = draggedNode === node.id
            ? (localNodePositions[node.id] || node.position)
            : node.position;

          return (
            <div
              key={node.id}
              className={`org-chart-node absolute bg-white rounded-lg shadow-md border-2 border-gray-200 p-4 cursor-move select-none ${draggedNode === node.id
                ? 'opacity-70 shadow-xl'
                : 'hover:shadow-lg'
                }`}
              style={{
                left: position.x + boundingBox.offsetX,
                top: position.y + boundingBox.offsetY,
                width: '200px',
                zIndex: draggedNode === node.id ? 10 : 2,
                transition: draggedNode === node.id ? 'none' : 'transform 0.15s ease-out, box-shadow 0.15s ease-out'
              }}
              draggable
              onDragStart={(e) => handleNodeDragStart(e, node.id)}
              onDragEnd={() => handleNodeDragEnd(node.id)}
              onClick={(e) => {
                // Only open modal if not dragging
                if (!draggedNode && onNodeSelect) {
                  e.stopPropagation();
                  onNodeSelect(node);
                }
              }}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation(); // Prevent modal from opening when removing
                  onNodeRemove(node.id);
                }}
                className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full text-xs hover:bg-red-600 flex items-center justify-center transition-colors duration-150"
              >
                ×
              </button>

              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium text-gray-900 truncate">
                  {node.contact.firstname} {node.contact.lastname}
                </h3>
                <p className="text-xs text-gray-600 truncate mt-1">
                  {node.contact.properties?.jobtitle?.value || 'No title'}
                </p>
              </div>
              
              {/* Click indicator */}
              <div className="absolute inset-0 rounded-lg border-2 border-transparent hover:border-blue-300 transition-colors duration-150 pointer-events-none"></div>
            </div>
          );
        })}

        {nodes.length === 0 && (
          <div className="flex items-center justify-center h-full min-h-96">
            <div className="text-center text-gray-500">
              <div className="text-6xl mb-4">📊</div>
              <h3 className="text-lg font-medium mb-2">Build Your Org Chart</h3>
              <p>Drag employees from the left sidebar to create your organization chart</p>
              <p className="text-sm mt-2">Vertical positioning determines hierarchy</p>
              <p className="text-sm mt-1 text-purple-600">💡 Use Auto-Organize for perfect alignment</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Manual Entry Panel Component
const ManualEntryPanel: React.FC<ManualEntryPanelProps> = ({ onAddPerson, maxLevel, availableParents }) => {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    jobTitle: '',
    email: '',
    level: 1,
    parentId: ''
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    
    if (!formData.firstName.trim()) {
      newErrors.firstName = 'First name is required';
    }
    
    if (!formData.lastName.trim()) {
      newErrors.lastName = 'Last name is required';
    }
    
    if (!formData.jobTitle.trim()) {
      newErrors.jobTitle = 'Job title is required';
    }
    
    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }
    
    if (formData.level < 1 || formData.level > maxLevel + 1) {
      newErrors.level = `Level must be between 1 and ${maxLevel + 1}`;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (validateForm()) {
      onAddPerson({
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        jobTitle: formData.jobTitle.trim(),
        email: formData.email.trim(),
        level: formData.level,
        parentId: formData.parentId || undefined
      });
      
      // Reset form
      setFormData({
        firstName: '',
        lastName: '',
        jobTitle: '',
        email: '',
        level: 1,
        parentId: ''
      });
      setErrors({});
    }
  };

  const handleInputChange = (field: string, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Clear error for this field when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  // Get potential parents (nodes at lower levels)
  const potentialParents = availableParents.filter(parent => 
    parent.level < formData.level
  );

  return (
    <div className="w-80 bg-white border-l border-gray-200 flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 bg-green-50">
        <h2 className="text-lg font-semibold text-gray-900">Add Person Manually</h2>
        <p className="text-sm text-gray-600 mt-1">
          Create custom entries for your org chart
        </p>
      </div>

      {/* Form */}
      <div className="flex-1 p-4 overflow-y-auto">
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* First Name */}
          <div>
            <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 mb-1">
              First Name *
            </label>
            <input
              type="text"
              id="firstName"
              value={formData.firstName}
              onChange={(e) => handleInputChange('firstName', e.target.value)}
              className={`w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-500 ${errors.firstName ? 'border-red-300' : 'border-gray-300'
                }`}
              placeholder="Enter first name"
            />
            {errors.firstName && <p className="text-red-500 text-xs mt-1">{errors.firstName}</p>}
          </div>

          {/* Last Name */}
          <div>
            <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 mb-1">
              Last Name *
            </label>
            <input
              type="text"
              id="lastName"
              value={formData.lastName}
              onChange={(e) => handleInputChange('lastName', e.target.value)}
              className={`w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-500 ${errors.lastName ? 'border-red-300' : 'border-gray-300'
                }`}
              placeholder="Enter last name"
            />
            {errors.lastName && <p className="text-red-500 text-xs mt-1">{errors.lastName}</p>}
          </div>

          {/* Job Title */}
          <div>
            <label htmlFor="jobTitle" className="block text-sm font-medium text-gray-700 mb-1">
              Job Title *
            </label>
            <input
              type="text"
              id="jobTitle"
              value={formData.jobTitle}
              onChange={(e) => handleInputChange('jobTitle', e.target.value)}
              className={`w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-500 ${errors.jobTitle ? 'border-red-300' : 'border-gray-300'
                }`}
              placeholder="e.g., Software Engineer"
            />
            {errors.jobTitle && <p className="text-red-500 text-xs mt-1">{errors.jobTitle}</p>}
          </div>

          {/* Email */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Email *
            </label>
            <input
              type="email"
              id="email"
              value={formData.email}
              onChange={(e) => handleInputChange('email', e.target.value)}
              className={`w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-500 ${errors.email ? 'border-red-300' : 'border-gray-300'
                }`}
              placeholder="person@example.com"
            />
            {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
          </div>

          {/* Level */}
          <div>
            <label htmlFor="level" className="block text-sm font-medium text-gray-700 mb-1">
              Hierarchy Level
            </label>
            <select
              id="level"
              value={formData.level}
              onChange={(e) => handleInputChange('level', parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              {Array.from({ length: Math.max(6, maxLevel + 2) }, (_, i) => (
                <option key={i} value={i}>
                  Level {i} {i === 0 ? '(Top)' : i === 1 ? '(Executive)' : i === 2 ? '(Management)' : ''}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Lower numbers = higher in hierarchy
            </p>
          </div>

          {/* Parent Selection */}
          <div>
            <label htmlFor="parentId" className="block text-sm font-medium text-gray-700 mb-1">
              Reports To
            </label>
            <select
              id="parentId"
              value={formData.parentId}
              onChange={(e) => handleInputChange('parentId', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="">No Parent (Root Level)</option>
              {potentialParents.map(parent => (
                <option key={parent.id} value={parent.id}>
                  {parent.contact.firstname} {parent.contact.lastname} 
                  {parent.contact.properties?.jobtitle?.value ? ` - ${parent.contact.properties.jobtitle.value}` : ''}
                  {` (Level ${parent.level})`}
                </option>
              ))}
            </select>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition-colors duration-150"
          >
            Add to Org Chart
          </button>
        </form>

        {/* Quick Tips */}
        <div className="mt-6 p-3 bg-gray-50 rounded-md">
          <h4 className="text-sm font-medium text-gray-900 mb-2">💡 Quick Tips</h4>
          <ul className="text-xs text-gray-600 space-y-1">
            <li>• Level 0 = CEO/Top leadership</li>
            <li>• Level 1 = VPs/Executives</li>
            <li>• Level 2 = Directors/Managers</li>
            <li>• Level 3+ = Individual contributors</li>
            <li>• You can drag nodes to reposition them after adding</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

// OrgChart Selection Panel Component - Simplified for company-based structure
interface OrgChartSelectionPanelProps {
  orgCharts: OrgChartAPI[];
  selectedOrgChart: OrgChartAPI | null;
  showCreateNew: boolean;
  showCSVUpload: boolean;
  newOrgChartData: {
    name: string;
    account_intel: string;
    website: string;
    narrative: string;
  };
  isCreating: boolean;
  onSelectOrgChart: (orgChart: OrgChartAPI | null) => void;
  onShowCreateNew: (show: boolean) => void;
  onShowCSVUpload: (show: boolean) => void;
  onUpdateNewOrgChartData: (data: Partial<{name: string; account_intel: string; website: string; narrative: string}>) => void;
  onCreateOrgChart: () => void;
  onLoadOrgChart: (orgChart: OrgChartAPI) => void;
  onEditOrgChart: (orgChart: OrgChartAPI) => void;
  onDeleteOrgChart: (orgChart: OrgChartAPI) => void;
  onClearEditor: () => void;
  onUpdateAccountIntel: (chartId: number, newAccountIntel: string) => Promise<void>;
  onRefetchOrgCharts: () => Promise<any>;
  onShowAlert: (title: string, message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  orgChartNodes: OrgChartNode[];
  initialOrgChartNodes: OrgChartNode[];
  onShowSaveConfirmation: (action: () => void) => void;
}

const OrgChartSelectionPanel: React.FC<OrgChartSelectionPanelProps> = ({
  orgCharts,
  selectedOrgChart,
  showCreateNew,
  showCSVUpload,
  newOrgChartData,
  isCreating,
  onSelectOrgChart,
  onShowCreateNew,
  onShowCSVUpload,
  onUpdateNewOrgChartData,
  onCreateOrgChart,
  onLoadOrgChart,
  onEditOrgChart,
  onDeleteOrgChart,
  onClearEditor,
  onUpdateAccountIntel,
  onRefetchOrgCharts,
  onShowAlert,
  orgChartNodes,
  initialOrgChartNodes,
  onShowSaveConfirmation
}) => {
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [editingAccountIntel, setEditingAccountIntel] = useState<number | null>(null);
  const [editedAccountIntel, setEditedAccountIntel] = useState<string>('');
  const [isSavingAccountIntel, setIsSavingAccountIntel] = useState(false);
  const [generatingIntel, setGeneratingIntel] = useState<Set<number>>(new Set());
  const [isBulkGenerating, setIsBulkGenerating] = useState(false);
  const [bulkGenerationProgress, setBulkGenerationProgress] = useState<{completed: number, total: number, failed: number}>({completed: 0, total: 0, failed: 0});
  const [sortConfig, setSortConfig] = useState<{key: 'name'; direction: 'asc' | 'desc' | null}>({key: 'name', direction: null});
  const [bulkGenerateConfirmationModal, setBulkGenerateConfirmationModal] = useState({
    isOpen: false,
    count: 0
  });

  // Handle sorting
  const handleSort = () => {
    let direction: 'asc' | 'desc' | null = 'asc';
    if (sortConfig.direction === 'asc') {
      direction = 'desc';
    } else if (sortConfig.direction === 'desc') {
      direction = null;
    }
    setSortConfig({ key: 'name', direction });
  };

  // Sort the orgCharts array
  const sortedOrgCharts = useMemo(() => {
    if (!sortConfig.direction) {
      return orgCharts;
    }
    
    const sorted = [...orgCharts].sort((a, b) => {
      const aName = a.name.toLowerCase();
      const bName = b.name.toLowerCase();
      
      if (sortConfig.direction === 'asc') {
        return aName.localeCompare(bName);
      } else {
        return bName.localeCompare(aName);
      }
    });
    
    return sorted;
  }, [orgCharts, sortConfig]);

  // Helper functions for account intel editing
  const startEditingAccountIntel = (chart: OrgChartAPI) => {
    // Prevent editing if already editing another chart or saving
    if (editingAccountIntel !== null || isSavingAccountIntel) {
      return;
    }
    setEditingAccountIntel(chart.id);
    setEditedAccountIntel(chart.account_intel || '');
  };

  // Function to generate account intel using the API
  const generateAccountIntel = async (chart: OrgChartAPI) => {
    // Prevent multiple simultaneous calls for the same chart
    if (generatingIntel.has(chart.id)) {
      return;
    }

    // Add chart ID to generating set
    setGeneratingIntel(prev => new Set(prev).add(chart.id));

    try {
      const response = await callBackend<
        { id: number; name: string; website: string },
        { account_intel: string }
      >(`org-charts/${chart.id}/generate_account_intel/`, {
        method: 'POST',
        data: {
          id: chart.id,
          name: chart.name,
          website: chart.website || ''
        }
      });

      console.log('Generated Account Intel Response:', response);
      
      // Update the chart data with the new intel
      if (response.account_intel) {
        console.log('🔄 Updating chart with generated account intel:', {
          chartId: chart.id,
          newAccountIntel: response.account_intel,
          newAccountIntelLength: response.account_intel.length
        });
        
        // Since the account intel generation API already updated the database,
        // we just need to refetch the data to update the UI
        console.log('🔄 Refetching orgcharts to get updated account intel...');
        await onRefetchOrgCharts();
        console.log('✅ Successfully refreshed chart data with generated account intel');
        
        // Show success message to user
        onShowAlert("Account Intel Generated", "Account intelligence has been generated and updated successfully", "success");
      } else {
        console.warn('⚠️ No account_intel in response:', response);
      }
      
    } catch (error) {
      console.error('Error generating account intel:', error);
    } finally {
      // Remove chart ID from generating set
      setGeneratingIntel(prev => {
        const newSet = new Set(prev);
        newSet.delete(chart.id);
        return newSet;
      });
    }
  };

  // Function to generate account intel for all charts in bulk
  const generateBulkAccountIntel = () => {
    // Get charts that don't have account intel or have empty account intel
    const chartsNeedingIntel = orgCharts.filter(chart => !chart.account_intel || chart.account_intel.trim() === '');
    
    if (chartsNeedingIntel.length === 0) {
      onShowAlert("No Action Needed", "All org charts already have account intelligence generated.", "info");
      return;
    }

    // Show confirmation modal
    setBulkGenerateConfirmationModal({
      isOpen: true,
      count: chartsNeedingIntel.length
    });
  };

  // Perform the actual bulk generation after confirmation
  const performBulkGenerateIntel = async () => {
    // Get charts that don't have account intel or have empty account intel
    const chartsNeedingIntel = orgCharts.filter(chart => !chart.account_intel || chart.account_intel.trim() === '');
    
    // Close the confirmation modal
    setBulkGenerateConfirmationModal({ isOpen: false, count: 0 });

    setIsBulkGenerating(true);
    setBulkGenerationProgress({completed: 0, total: chartsNeedingIntel.length, failed: 0});

    let completedCount = 0;
    let failedCount = 0;

    // Process all charts concurrently
    const promises = chartsNeedingIntel.map(async (chart) => {
      // Add chart ID to generating set
      setGeneratingIntel(prev => new Set(prev).add(chart.id));

      try {
        const response = await callBackend<
          { id: number; name: string; website: string },
          { account_intel: string }
        >(`org-charts/${chart.id}/generate_account_intel/`, {
          method: 'POST',
          data: {
            id: chart.id,
            name: chart.name,
            website: chart.website || ''
          }
        });

        console.log(`Generated Account Intel for ${chart.name}:`, response);
        
        if (response.account_intel) {
          completedCount++;
          // Update progress
          setBulkGenerationProgress(prev => ({
            ...prev,
            completed: completedCount,
            failed: failedCount
          }));
        }
        
        return { success: true, chartId: chart.id };
      } catch (error) {
        console.error(`Error generating account intel for ${chart.name}:`, error);
        failedCount++;
        setBulkGenerationProgress(prev => ({
          ...prev,
          completed: completedCount,
          failed: failedCount
        }));
        return { success: false, chartId: chart.id, error };
      } finally {
        // Remove chart ID from generating set
        setGeneratingIntel(prev => {
          const newSet = new Set(prev);
          newSet.delete(chart.id);
          return newSet;
        });
      }
    });

    // Wait for all promises to complete
    const results = await Promise.allSettled(promises);
    
    // Final refetch to update all data at once
    await onRefetchOrgCharts();
    
    // Final cleanup
    setIsBulkGenerating(false);
    
    // Show completion message
    const successful = results.filter(result => 
      result.status === 'fulfilled' && result.value.success
    ).length;
    const failed = results.length - successful;
    
    if (failed === 0) {
      onShowAlert(
        "Bulk Generation Complete", 
        `Successfully generated account intelligence for ${successful} org chart${successful !== 1 ? 's' : ''}.`, 
        "success"
      );
    } else {
      onShowAlert(
        "Bulk Generation Complete", 
        `Generated account intelligence for ${successful} org chart${successful !== 1 ? 's' : ''}. ${failed} failed.`, 
        successful > 0 ? "warning" : "error"
      );
    }
    
    // Reset progress
    setBulkGenerationProgress({completed: 0, total: 0, failed: 0});
  };

  const cancelEditingAccountIntel = () => {
    setEditingAccountIntel(null);
    setEditedAccountIntel('');
  };

  const saveAccountIntel = async (chartId: number) => {
    if (isSavingAccountIntel) return;
    
    setIsSavingAccountIntel(true);
    try {
      await onUpdateAccountIntel(chartId, editedAccountIntel);
      setEditingAccountIntel(null);
      setEditedAccountIntel('');
    } catch (error) {
      console.error('Failed to save account intel:', error);
      // Error handling is done in the parent component
    } finally {
      setIsSavingAccountIntel(false);
    }
  };

  // Bulk generate intel modal handlers
  const handleCloseBulkGenerateModal = () => {
    setBulkGenerateConfirmationModal({
      isOpen: false,
      count: 0
    });
  };

  const handleConfirmBulkGenerate = () => {
    performBulkGenerateIntel();
  };

  return (
    <div className="bg-white border-b border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-semibold text-gray-900">Target Accounts</h2>
          {selectedOrgChart && (
            <button
              onClick={() => {
                onSelectOrgChart(null);
                setExpandedRows(new Set());
                onClearEditor();
              }}
              className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 text-sm flex items-center gap-2 transition-colors shadow-sm"
              title="Return to full table view and clear the editor"
            >
              ← Show All Charts
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => onShowCreateNew(!showCreateNew)}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
          >
            {showCreateNew ? 'Cancel' : 'Add Target Account'}
          </button>
          <button
            onClick={() => onShowCSVUpload(!showCSVUpload)}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm"
          >
            {showCSVUpload ? 'Cancel' : 'Bulk Upload CSV'}
          </button>
          {orgCharts.length > 0 && (
            <button
              onClick={generateBulkAccountIntel}
              disabled={isBulkGenerating || orgCharts.length === 0}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              title="Generate account intelligence for all org charts that don't have it"
            >
              {isBulkGenerating ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Generating ({bulkGenerationProgress.completed}/{bulkGenerationProgress.total})
                </>
              ) : (
                <>
                  🧠 Bulk Generate Intel
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {showCreateNew && (
        <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <h3 className="text-lg font-medium text-gray-900 mb-3">Create New Org Chart</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Chart Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Chart Name *
              </label>
              <input
                type="text"
                value={newOrgChartData.name}
                onChange={(e) => onUpdateNewOrgChartData({ name: e.target.value })}
                placeholder="e.g., Q1 2024 Structure"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                Company will be automatically assigned to your organization
              </p>
            </div>

            {/* Narrative */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Narrative
              </label>
              <input
                type="text"
                value={newOrgChartData.narrative}
                onChange={(e) => onUpdateNewOrgChartData({ narrative: e.target.value })}
                placeholder="Enter a narrative title..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                This will appear as a title above the org chart editor
              </p>
            </div>

            {/* account_intel */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Account Intel
              </label>
              <input
                type="text"
                value={newOrgChartData.account_intel}
                onChange={(e) => onUpdateNewOrgChartData({ account_intel: e.target.value })}
                placeholder="Account Intel"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Website */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Company Website
              </label>
              <input
                type="url"
                value={newOrgChartData.website}
                onChange={(e) => onUpdateNewOrgChartData({ website: e.target.value })}
                placeholder="https://company.com or http://company.com"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="mt-4">
            <button
              onClick={onCreateOrgChart}
              disabled={!newOrgChartData.name || isCreating}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 text-sm"
            >
              {isCreating ? 'Creating...' : 'Create Org Chart'}
            </button>
          </div>
        </div>
      )}

      {/* CSV Bulk Upload */}
      {showCSVUpload && (
        <CSVBulkUpload 
          onUploadSuccess={() => {
            // Refresh org charts list after successful upload
            onRefetchOrgCharts();
            // Optionally close the upload section
            // onShowCSVUpload(false);
          }}
        />
      )}

      {/* Existing Org Charts Table */}
      {orgCharts.length > 0 && (
        <div className="mb-4">
          {isBulkGenerating && bulkGenerationProgress.total > 0 && (
            <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center justify-between text-sm text-blue-800 mb-2">
                <span>Bulk Generation Progress</span>
                <span>{bulkGenerationProgress.completed + bulkGenerationProgress.failed}/{bulkGenerationProgress.total}</span>
              </div>
              <div className="w-full bg-blue-200 rounded-full h-2 mb-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300 ease-out" 
                  style={{ width: `${((bulkGenerationProgress.completed + bulkGenerationProgress.failed) / bulkGenerationProgress.total) * 100}%` }}
                ></div>
              </div>
              <div className="flex justify-between text-xs text-blue-600">
                <span>✅ Completed: {bulkGenerationProgress.completed}</span>
                {bulkGenerationProgress.failed > 0 && (
                  <span>❌ Failed: {bulkGenerationProgress.failed}</span>
                )}
              </div>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="min-w-full bg-white border border-gray-200 rounded-lg shadow-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th 
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b w-1/4 cursor-pointer hover:bg-gray-100 transition-colors select-none"
                    onClick={handleSort}
                    title="Click to sort by Target Account Name"
                  >
                    <div className="flex items-center gap-2">
                      <span>Target Account</span>
                      <span className="inline-flex flex-col text-gray-400">
                        {sortConfig.direction === null && (
                          <span className="text-xs">⇅</span>
                        )}
                        {sortConfig.direction === 'asc' && (
                          <span className="text-blue-600 text-xs">▲</span>
                        )}
                        {sortConfig.direction === 'desc' && (
                          <span className="text-blue-600 text-xs">▼</span>
                        )}
                      </span>
                    </div>
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b w-2/5">
                    Account Intel
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b w-1/5">
                    Website
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-b w-1/5">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {sortedOrgCharts
                  .filter(chart => !selectedOrgChart || selectedOrgChart.id === chart.id)
                  .map((chart, index) => {
                  const isExpanded = expandedRows.has(chart.id);
                  return (
                    <React.Fragment key={chart.id}>
                      <tr 
                        className={`transition-colors duration-150 ${
                          selectedOrgChart?.id === chart.id
                            ? 'bg-blue-50 border-l-4 border-l-blue-500 cursor-default'
                            : 'cursor-pointer hover:bg-gray-50 hover:shadow-sm'
                        }`}
                        title={selectedOrgChart?.id === chart.id ? 'Chart is currently loaded in the editor' : 'Click to select and load this chart into the editor'}
                        onClick={() => {
                          // Only allow selection if not already selected
                          if (selectedOrgChart?.id !== chart.id) {
                            // Selecting new row - show only this row, expand details, and load chart data
                            onSelectOrgChart(chart);
                            setExpandedRows(new Set([chart.id]));
                            onLoadOrgChart(chart); // Load the chart data into the editor
                          }
                        }}
                      >
                        {/* Chart Name Column */}
                        <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0">
                          <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                            <span className="text-white text-xs font-medium">
                              {chart.name.charAt(0).toUpperCase()}
                            </span>
                          </div>
                        </div>
                        <div className="ml-3">
                          <div className="text-sm font-medium text-gray-900 flex items-center gap-2">
                            {chart.name}
                            {selectedOrgChart?.id === chart.id ? (
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                ✅ Currently Loaded
                              </span>
                            ) : (
                              <span className="inline-flex items-center text-xs text-gray-500">
                                👆 Click to load
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500">
                            Updated: {new Date(chart.updated_at).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Account Intel Column - Editable */}
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">
                        {editingAccountIntel === chart.id ? (
                          // Edit mode
                          <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                            <textarea
                              value={editedAccountIntel}
                              onChange={(e) => setEditedAccountIntel(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Escape') {
                                  cancelEditingAccountIntel();
                                } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                                  saveAccountIntel(chart.id);
                                }
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-vertical"
                              rows={4}
                              placeholder="Enter account intelligence information..."
                              disabled={isSavingAccountIntel}
                              autoFocus
                            />
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => saveAccountIntel(chart.id)}
                                  disabled={isSavingAccountIntel}
                                  className="px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
                                >
                                  {isSavingAccountIntel && (
                                    <div className="animate-spin h-3 w-3 border border-white rounded-full border-t-transparent"></div>
                                  )}
                                  {isSavingAccountIntel ? 'Saving...' : '💾 Save'}
                                </button>
                                <button
                                  onClick={cancelEditingAccountIntel}
                                  disabled={isSavingAccountIntel}
                                  className="px-3 py-1 bg-gray-500 text-white rounded text-xs hover:bg-gray-600 disabled:opacity-50"
                                >
                                  Cancel
                                </button>
                              </div>
                              <div className="text-xs text-gray-500">
                                Ctrl+Enter to save, Esc to cancel
                              </div>
                            </div>
                          </div>
                        ) : (
                          // View mode
                          <div className="group">
                            {chart.account_intel ? (
                              <div 
                                className="break-words cursor-pointer hover:bg-gray-50 p-2 rounded border border-transparent hover:border-gray-200 transition-all max-h-20 overflow-y-auto text-xs leading-relaxed"
                                title="Click to edit account intel"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  startEditingAccountIntel(chart);
                                }}
                              >
                                {chart.account_intel}
                                <span className="ml-2 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity">
                                  ✏️
                                </span>
                              </div>
                            ) : (
                              <div 
                                className="text-gray-400 italic cursor-pointer hover:bg-gray-50 p-2 rounded border border-transparent hover:border-gray-200 transition-all"
                                title="Click to add account intel"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  startEditingAccountIntel(chart);
                                }}
                              >
                                No account intel
                                <span className="ml-2 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity">
                                  ➕
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Website Column */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      {chart.website ? (
                        <a
                          href={chart.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          🌐 {chart.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                        </a>
                      ) : (
                        <span className="text-sm text-gray-400 italic">No website</span>
                      )}
                    </td>

                    {/* Actions Column */}
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <div className="flex items-center justify-center space-x-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            generateAccountIntel(chart);
                          }}
                          disabled={generatingIntel.has(chart.id) || isBulkGenerating}
                          className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-md text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Generate account intelligence using AI"
                        >
                          {generatingIntel.has(chart.id) ? (
                            <>🔄 Generating...</>
                          ) : (
                            <>🧠 Generate Intel</>
                          )}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditOrgChart(chart);
                          }}
                          className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-md text-white bg-gray-600 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors"
                          title="Edit chart details"
                        >
                          ✏️ Edit
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteOrgChart(chart);
                          }}
                          className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors"
                          title="Delete chart"
                        >
                          🗑️ Delete
                        </button>
                      </div>
                    </td>
                  </tr>

                  {/* Expanded Row Content */}
                  {isExpanded && (
                    <tr className={`${
                      selectedOrgChart?.id === chart.id
                        ? 'bg-blue-50 border-l-4 border-l-blue-500'
                        : 'bg-gray-50'
                    }`}>
                      <td colSpan={4} className="px-6 py-4">
                        <div className="space-y-3">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                            <div>
                              <span className="font-medium text-gray-900">Created:</span>
                              <span className="ml-2 text-gray-600">
                                {new Date(chart.created_at).toLocaleString()}
                              </span>
                            </div>
                            <div>
                              <span className="font-medium text-gray-900">Last Updated:</span>
                              <span className="ml-2 text-gray-600">
                                {new Date(chart.updated_at).toLocaleString()}
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Currently Loaded Chart Indicator */}
      {selectedOrgChart && (
        <div className="mt-4 p-3 bg-green-50 rounded-lg border border-green-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-green-600 font-medium">📊 Currently Loaded:</span>
              <span className="text-gray-900 font-medium">{selectedOrgChart.name}</span>
            </div>
            <button
              onClick={() => {
                // Check for unsaved changes before clearing
                const hasChanges = orgChartNodes.length > 0 && (
                  initialOrgChartNodes.length === 0 || 
                  orgChartNodes.length !== initialOrgChartNodes.length ||
                  orgChartNodes.map(n => n.contact.id).sort().join(',') !== initialOrgChartNodes.map(n => n.contact.id).sort().join(',')
                );
                
                if (hasChanges) {
                  onShowSaveConfirmation(() => {
                    onSelectOrgChart(null);
                    setExpandedRows(new Set());
                    onClearEditor();
                  });
                } else {
                  onSelectOrgChart(null);
                  setExpandedRows(new Set());
                  onClearEditor();
                }
              }}
              className="text-sm text-green-700 hover:text-green-900 underline"
            >
              Clear & Show All Charts
            </button>
          </div>
        </div>
      )}

      {orgCharts.length === 0 && !showCreateNew && (
        <div className="text-center text-gray-500 py-8">
          <p>No org charts found for your company. Create your first one!</p>
        </div>
      )}

      {/* Bulk Generate Intel Confirmation Modal */}
      {bulkGenerateConfirmationModal.isOpen && (
        <BaseModal show={bulkGenerateConfirmationModal.isOpen} onClose={handleCloseBulkGenerateModal}>
          <div className="p-6">
            {/* Header */}
            <div className="flex items-center mb-4">
              <div className="flex-shrink-0 w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-purple-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                  />
                </svg>
              </div>
              <div className="ml-4">
                <h3 className="text-lg font-medium text-gray-900">Bulk Generate Account Intelligence</h3>
              </div>
            </div>

            {/* Message */}
            <div className="mb-6">
              <p className="text-sm text-gray-500">
                Are you sure you want to generate intel for{' '}
                <span className="font-semibold text-gray-900">
                  {bulkGenerateConfirmationModal.count} {bulkGenerateConfirmationModal.count === 1 ? 'account' : 'accounts'}
                </span>
                ? This process may take some time to complete.
              </p>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3">
              <button
                onClick={handleCloseBulkGenerateModal}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmBulkGenerate}
                className="px-4 py-2 text-sm font-medium text-white bg-purple-600 border border-transparent rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 flex items-center gap-2"
              >
                🧠 Generate Intel
              </button>
            </div>
          </div>
        </BaseModal>
      )}
    </div>
  );
};

// Function to build hierarchical structure from flat nodes using explicit parent relationships
const buildHierarchy = (nodes: OrgChartNode[]): HierarchicalNode[] => {
  const nodeMap = new Map<string, HierarchicalNode>();
  
  // Convert all nodes to hierarchical nodes
  nodes.forEach(node => {
    nodeMap.set(node.id, {
      ...node,
      children: []
    });
  });
  
  const rootNodes: HierarchicalNode[] = [];
  
  // Build parent-child relationships using explicit parentId
  nodes.forEach(node => {
    const hierarchicalNode = nodeMap.get(node.id)!;
    
    if (node.parentId) {
      // This node has an explicit parent
      const parent = nodeMap.get(node.parentId);
      if (parent) {
        hierarchicalNode.parent = parent;
        parent.children.push(hierarchicalNode);
      } else {
        // Parent not found, treat as root
        rootNodes.push(hierarchicalNode);
      }
    } else {
      // No explicit parent, this is a root node
      rootNodes.push(hierarchicalNode);
    }
  });
  
  // For nodes without explicit parents, fall back to proximity-based assignment
  // but only if they're not already assigned
  const unassignedNodes = Array.from(nodeMap.values()).filter(node => 
    !node.parent && !rootNodes.includes(node)
  );
  
  if (unassignedNodes.length > 0) {
    // Group nodes by level for proximity-based assignment
    const nodesByLevel = nodes.reduce((acc, node) => {
      if (!acc[node.level]) acc[node.level] = [];
      acc[node.level].push(node);
      return acc;
    }, {} as Record<number, OrgChartNode[]>);
    
    Object.keys(nodesByLevel).forEach(levelStr => {
      const level = parseInt(levelStr);
      const currentLevelNodes = nodesByLevel[level];
      const nextLevelNodes = nodesByLevel[level + 1];
      
      if (nextLevelNodes) {
        currentLevelNodes.forEach(parentNode => {
          const parent = nodeMap.get(parentNode.id)!;
          
          // Only assign children if this parent doesn't already have explicit children
          // and the potential children don't have explicit parents
          const potentialChildren = nextLevelNodes
            .filter(childNode => {
              const child = nodeMap.get(childNode.id)!;
              return !child.parent && !childNode.parentId;
            })
            .map(child => ({
              node: child,
              distance: Math.abs(child.position.x - parentNode.position.x)
            }))
            .sort((a, b) => a.distance - b.distance);
          
          // Assign closest children that don't already have parents
          potentialChildren.forEach(({ node: childNode, distance }) => {
            const child = nodeMap.get(childNode.id)!;
            
            if (!child.parent && distance < 350) {
              // Check if this child is closest to this parent compared to other parents
              const isClosestToThisParent = currentLevelNodes.every(otherParent => {
                if (otherParent.id === parentNode.id) return true;
                return Math.abs(childNode.position.x - parentNode.position.x) <= 
                       Math.abs(childNode.position.x - otherParent.position.x);
              });
              
              if (isClosestToThisParent) {
                child.parent = parent;
                parent.children.push(child);
              }
            }
          });
        });
      }
    });
    
    // Any remaining unassigned nodes become roots
    nodeMap.forEach(node => {
      if (!node.parent && !rootNodes.includes(node)) {
        rootNodes.push(node);
      }
    });
  }

  return rootNodes;
};

// Function to calculate optimal layout positions
const calculateOptimalLayout = (hierarchy: HierarchicalNode[], existingNodes: OrgChartNode[]): Record<string, { x: number; y: number }> => {
  const positions: Record<string, { x: number; y: number }> = {};
  
  // Calculate subtree widths first (bottom-up)
  const calculateSubtreeWidth = (node: HierarchicalNode): number => {
    if (node.children.length === 0) {
      node.subtreeWidth = LAYOUT_CONFIG.NODE_WIDTH;
      return node.subtreeWidth;
    }
    
    // Calculate width needed for all children
    const childrenWidth = node.children.reduce((total, child, index) => {
      const childWidth = calculateSubtreeWidth(child);
      return total + childWidth + (index > 0 ? LAYOUT_CONFIG.HORIZONTAL_SPACING : 0);
    }, 0);
    
    // Node needs at least its own width, or enough width for its children
    node.subtreeWidth = Math.max(LAYOUT_CONFIG.NODE_WIDTH, childrenWidth + LAYOUT_CONFIG.SUBTREE_PADDING);
    return node.subtreeWidth;
  };
  
  // Calculate positions (top-down) - PRESERVE ORIGINAL LEVELS
  const positionSubtree = (node: HierarchicalNode, startX: number, preserveY: boolean = false) => {
    // Calculate children width
    const childrenTotalWidth = node.children.reduce((total, child, index) => {
      return total + (child.subtreeWidth || LAYOUT_CONFIG.NODE_WIDTH) + 
             (index > 0 ? LAYOUT_CONFIG.HORIZONTAL_SPACING : 0);
    }, 0);
    
    // Center parent over children, or use provided position if no children
    let parentX: number;
    if (node.children.length > 0) {
      // Center parent over children
      const childrenStartX = startX + Math.max(0, (node.subtreeWidth! - childrenTotalWidth) / 2);
      const childrenEndX = childrenStartX + childrenTotalWidth;
      parentX = (childrenStartX + childrenEndX) / 2 - LAYOUT_CONFIG.NODE_WIDTH / 2;
    } else {
      // No children, center in available space
      parentX = startX + (node.subtreeWidth! - LAYOUT_CONFIG.NODE_WIDTH) / 2;
    }
    
    // Set parent position - PRESERVE ORIGINAL Y POSITION AND LEVEL
    const originalY = node.position.y; // Use the original Y position from the node
    positions[node.id] = { x: Math.max(0, parentX), y: originalY };
    
    // Position children
    if (node.children.length > 0) {
      let currentChildX = startX + Math.max(0, (node.subtreeWidth! - childrenTotalWidth) / 2);
      
      node.children.forEach(child => {
        positionSubtree(child, currentChildX, true); // Pass true to preserve Y positions
        currentChildX += (child.subtreeWidth || LAYOUT_CONFIG.NODE_WIDTH) + LAYOUT_CONFIG.HORIZONTAL_SPACING;
      });
    }
  };
  
  // Calculate subtree widths for all hierarchies
  hierarchy.forEach(calculateSubtreeWidth);
  
  // Position each root hierarchy
  let currentX = 100; // Start position
  hierarchy.forEach(root => {
    positionSubtree(root, currentX, false); // Start positioning from the root
    currentX += (root.subtreeWidth || LAYOUT_CONFIG.NODE_WIDTH) + 100; // Space between separate hierarchies
  });
  
  return positions;
};

// Function to generate sophisticated arrows with T-connectors
const generateHierarchicalArrows = (hierarchy: HierarchicalNode[], positions: Record<string, { x: number; y: number }>, boundingBox: any): HierarchicalArrow[] => {
  const arrows: HierarchicalArrow[] = [];
  
  const generateArrowsForNode = (node: HierarchicalNode) => {
    if (node.children.length === 0) return;
    
    const parentPos = positions[node.id];
    if (!parentPos) return;
    
    const parentCenterX = parentPos.x + boundingBox.offsetX + LAYOUT_CONFIG.NODE_WIDTH / 2;
    const parentBottomY = parentPos.y + boundingBox.offsetY + LAYOUT_CONFIG.NODE_HEIGHT;
    
    if (node.children.length === 1) {
      // Single child - direct arrow
      const child = node.children[0];
      const childPos = positions[child.id];
      if (childPos) {
        const childCenterX = childPos.x + boundingBox.offsetX + LAYOUT_CONFIG.NODE_WIDTH / 2;
        const childTopY = childPos.y + boundingBox.offsetY;
        
        arrows.push({
          type: 'direct',
          from: { x: parentCenterX, y: parentBottomY },
          to: { x: childCenterX, y: childTopY },
          key: `direct-${node.id}-${child.id}`
        });
      }
    } else {
      // Multiple children - T-connector system
      const childPositions = node.children
        .map(child => {
          const pos = positions[child.id];
          return pos ? {
            child,
            centerX: pos.x + boundingBox.offsetX + LAYOUT_CONFIG.NODE_WIDTH / 2,
            topY: pos.y + boundingBox.offsetY
          } : null;
        })
        .filter(Boolean) as Array<{ child: HierarchicalNode; centerX: number; topY: number }>;
      
      if (childPositions.length > 0) {
        // Find the range of children positions
        const minChildX = Math.min(...childPositions.map(cp => cp.centerX));
        const maxChildX = Math.max(...childPositions.map(cp => cp.centerX));
        const childrenY = childPositions[0].topY; // All children at same level
        
        // Vertical line from parent
        const connectorY = parentBottomY + (childrenY - parentBottomY) / 2;
        arrows.push({
          type: 'vertical',
          from: { x: parentCenterX, y: parentBottomY },
          to: { x: parentCenterX, y: connectorY },
          key: `vertical-${node.id}`,
          parent: node,
          children: node.children
        });
        
        // Horizontal connector line
        arrows.push({
          type: 'horizontal',
          from: { x: minChildX, y: connectorY },
          to: { x: maxChildX, y: connectorY },
          key: `horizontal-${node.id}`,
          parent: node,
          children: node.children
        });
        
        // Vertical lines to each child
        childPositions.forEach(({ child, centerX }) => {
          arrows.push({
            type: 'T-connector',
            from: { x: centerX, y: connectorY },
            to: { x: centerX, y: childrenY },
            key: `connector-${node.id}-${child.id}`,
            parent: node,
            children: [child]
          });
        });
      }
    }
    
    // Recursively generate arrows for children
    node.children.forEach(generateArrowsForNode);
  };
  
  hierarchy.forEach(generateArrowsForNode);
  return arrows;
};

// Main OrgCharts Component
const OrgCharts: React.FC = () => {
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [companyName, setCompanyName] = useState<string>("");
  const [website, setWebsite] = useState<string>("");
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [orgChartNodes, setOrgChartNodes] = useState<OrgChartNode[]>([]);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [selectedNodeForInfo, setSelectedNodeForInfo] = useState<OrgChartNode | null>(null);

  // Pagination state for HubSpot employees
  const [allEmployees, setAllEmployees] = useState<Contact[]>([]);
  const [employeeCursor, setEmployeeCursor] = useState<string | undefined>(undefined);
  const [employeeNextCursor, setEmployeeNextCursor] = useState<string | undefined>(undefined);
  const [employeeHasMore, setEmployeeHasMore] = useState(false);
  const [isLoadingMoreEmployees, setIsLoadingMoreEmployees] = useState(false);

  // Cache for storing selectedCompanyId per org chart to persist across switches
  const companyIdCache = useRef<Map<number, string>>(new Map());

  // New state for org chart management - simplified for company-based structure
  const [selectedOrgChart, setSelectedOrgChart] = useState<OrgChartAPI | null>(null);
  const [showCreateNew, setShowCreateNew] = useState(false);
  const [showCSVUpload, setShowCSVUpload] = useState(false);
  const [newOrgChartData, setNewOrgChartData] = useState({
    name: '',
    account_intel: '',
    website: '',
    narrative: ''
  });

  // Edit org chart modal state
  const [editOrgChartModal, setEditOrgChartModal] = useState({
    isOpen: false,
    orgChart: null as OrgChartAPI | null
  });

  // Delete confirmation modal state
  const [deleteConfirmationModal, setDeleteConfirmationModal] = useState({
    isOpen: false,
    orgChart: null as OrgChartAPI | null
  });

  // Save confirmation modal state for clearing charts
  const [saveConfirmationModal, setSaveConfirmationModal] = useState({
    isOpen: false,
    action: null as (() => void) | null // The action to execute after clearing
  });

  // Track initially loaded nodes to detect unsaved changes
  const [initialOrgChartNodes, setInitialOrgChartNodes] = useState<OrgChartNode[]>([]);

  // AI org chart generation state
  const [isGeneratingOrgChart, setIsGeneratingOrgChart] = useState(false);

  // Modal state management
  const [alertModal, setAlertModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'success' | 'error' | 'warning' | 'info';
  }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'info'
  });

  const [promptModal, setPromptModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    placeholder?: string;
    defaultValue?: string;
    onConfirm?: (value: string) => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    placeholder: '',
    defaultValue: '',
    onConfirm: undefined
  });

  // Save New Chart modal state
  const [saveChartModal, setSaveChartModal] = useState<{
    isOpen: boolean;
    chartData: {
      name: string;
      account_intel: string;
      website: string;
      narrative: string;
    };
    errors: Record<string, string>;
    isSaving: boolean;
  }>({
    isOpen: false,
    chartData: {
      name: '',
      account_intel: '',
      website: '',
      narrative: ''
    },
    errors: {},
    isSaving: false
  });

  // Helper functions for showing modals
  const showAlert = (title: string, message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') => {
    setAlertModal({
      isOpen: true,
      title,
      message,
      type
    });
  };

  const showPrompt = (
    title: string, 
    message: string, 
    onConfirm: (value: string) => void,
    placeholder?: string,
    defaultValue?: string
  ) => {
    setPromptModal({
      isOpen: true,
      title,
      message,
      placeholder,
      defaultValue,
      onConfirm
    });
  };

  const closeAlert = () => {
    setAlertModal(prev => ({ ...prev, isOpen: false }));
  };

  const closePrompt = () => {
    setPromptModal(prev => ({ ...prev, isOpen: false }));
  };

  const handlePromptConfirm = (value: string) => {
    if (promptModal.onConfirm) {
      promptModal.onConfirm(value);
    }
    closePrompt();
  };

  // Save Chart modal helpers
  const showSaveChartModal = (defaultName?: string) => {
    const companyName = searchedCompany?.name || 'Organization';
    setSaveChartModal({
      isOpen: true,
      chartData: {
        name: defaultName || `${companyName} Chart`,
        account_intel: '',
        website: '',
        narrative: ''
      },
      errors: {},
      isSaving: false
    });
  };

  const closeSaveChartModal = () => {
    setSaveChartModal(prev => ({ ...prev, isOpen: false }));
  };

  // Website validation helper function - matches Django URLValidator
  const validateWebsiteUrl = (website: string): string | null => {
    if (!website.trim()) {
      return 'Website is required';
    }

    const trimmedUrl = website.trim();

    // Django URLValidator regex pattern (simplified for JavaScript)
    // Allows http, https, ftp, ftps schemes like Django's URLValidator
    const urlPattern = /^(?:http|https|ftp|ftps):\/\/(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?::\d{1,5})?(?:\/[^\s]*)?$/i;
    
    // Additional validation using URL constructor for more thorough checking
    try {
      const url = new URL(trimmedUrl);
      
      // Check allowed schemes (same as Django URLValidator default)
      const allowedSchemes = ['http:', 'https:', 'ftp:', 'ftps:'];
      if (!allowedSchemes.includes(url.protocol)) {
        return 'Enter a valid URL.';
      }

      // Check hostname exists and is valid
      if (!url.hostname || url.hostname.length < 1) {
        return 'Enter a valid URL.';
      }

      // Additional pattern check for Django compatibility
      if (!urlPattern.test(trimmedUrl)) {
        return 'Enter a valid URL.';
      }

    } catch {
      return 'Enter a valid URL.';
    }

    return null; // No error
  };

  const validateSaveChartForm = (data: { name: string; account_intel: string; website: string }) => {
    const errors: Record<string, string> = {};

    // Required field validations
    if (!data.name.trim()) {
      errors.name = 'Chart name is required';
    }

    if (!data.account_intel.trim()) {
      errors.account_intel = 'Account intel is required';
    }

    // Website validation using helper function
    const websiteError = validateWebsiteUrl(data.website);
    if (websiteError) {
      errors.website = websiteError;
    }

    // Check for duplicate chart names
    if (data.name.trim() && orgCharts && orgCharts.some(chart => 
      chart.name.toLowerCase() === data.name.trim().toLowerCase()
    )) {
      errors.name = 'A chart with this name already exists. Please choose a different name.';
    }

    return errors;
  };

  const updateSaveChartData = (updates: Partial<typeof saveChartModal.chartData>) => {
    setSaveChartModal(prev => ({
      ...prev,
      chartData: { ...prev.chartData, ...updates },
      errors: {} // Clear errors when user starts typing
    }));
  };

  const handleSaveChartSubmit = async () => {
    const { chartData } = saveChartModal;
    const errors = validateSaveChartForm(chartData);
    
    if (Object.keys(errors).length > 0) {
      setSaveChartModal(prev => ({ ...prev, errors }));
      return;
    }

    setSaveChartModal(prev => ({ ...prev, isSaving: true }));

    try {
      // Get the pending chart data that was stored when user clicked Save New Chart
      const pendingChartData = (window as any).__pendingChartData;
      
      if (!pendingChartData) {
        throw new Error('No chart data found. Please try saving again.');
      }

      // Normalize the website URL
      let normalizedWebsite = chartData.website.trim();
      if (!normalizedWebsite.startsWith('http')) {
        normalizedWebsite = `https://${normalizedWebsite}`;
      }

      // Update the chart metadata with the form data
      const finalChartData = {
        ...pendingChartData,
        metadata: {
          ...pendingChartData.metadata,
          name: chartData.name.trim(),
          account_intel: chartData.account_intel.trim()
        }
      };

      const newChart = await createOrgChart({
        name: chartData.name.trim(),
        chart_data: finalChartData,
        website: normalizedWebsite,
        account_intel: chartData.account_intel.trim(),
        narrative: chartData.narrative.trim() || undefined
      });

      setSelectedOrgChart(newChart);
      setInitialOrgChartNodes([...orgChartNodes]); // Update initial state after successful creation
      closeSaveChartModal();
      
      // Clean up the stored chart data
      delete (window as any).__pendingChartData;
      
      showAlert("Chart Created", `Created "${newChart.name}" successfully!`, "success");
    } catch (error) {
      console.error('Create error:', error);
      
      // Check if it's a 400 error indicating duplicate name
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      const isNetworkError = error && typeof error === 'object' && 'response' in error;
      const status = isNetworkError ? (error as any).response?.status : null;
      
      if (status === 400 && (
        errorMessage.toLowerCase().includes('already exists') ||
        errorMessage.toLowerCase().includes('duplicate') ||
        errorMessage.toLowerCase().includes('name') ||
        errorMessage.toLowerCase().includes('already in use')
      )) {
        setSaveChartModal(prev => ({ 
          ...prev, 
          errors: { name: 'A chart with this name already exists. Please choose a different name.' },
          isSaving: false
        }));
      } else {
        setSaveChartModal(prev => ({ ...prev, isSaving: false }));
        showAlert("Creation Failed", `Failed to create chart: ${errorMessage}`, "error");
      }
    }
  };

  // Ref to track the last auto-searched org chart ID to prevent duplicate searches
  const lastSearchedOrgChartId = useRef<number | null>(null);

  // Get user profile
  const { data: userProfile } = useBackendQuery<UserProfile>("profile/");

  // Fetch org charts for user's company (company is auto-assigned by backend)
  const { data: orgCharts, isLoading: loadingOrgCharts, refetch: refetchOrgCharts } = useBackendQuery<OrgChartAPI[]>(
    "org-charts/",
    {
      enabled: !!userProfile?.id
    }
  );

  // Add logging to track orgCharts API data
  React.useEffect(() => {
    if (orgCharts) {
      console.log('🏗️ OrgCharts API Response:', {
        totalCharts: orgCharts.length,
        charts: orgCharts.map(chart => ({
          id: chart.id,
          name: chart.name,
          company: chart.company,
          website: chart.website,
          created_at: chart.created_at,
          updated_at: chart.updated_at,
          chart_data: {
            version: chart.chart_data?.version || 'unknown',
            metadata: {
              name: chart.chart_data?.metadata?.name || chart.name,
              account_intel: chart.account_intel,
              account_intel_length: chart.account_intel?.length || 0,
              created_at: chart.chart_data?.metadata?.created_at || chart.created_at,
              last_modified: chart.chart_data?.metadata?.last_modified || chart.updated_at
            },
            has_root_node: !!chart.chart_data?.root_node,
            has_ai_metadata: !!chart.chart_data?.ai_metadata
          }
        }))
      });
      
      // Also log raw data for debugging
      console.log('🔍 Raw OrgCharts API Data:', orgCharts);
    } else if (orgCharts === null || orgCharts === undefined) {
      console.log('⚠️ OrgCharts API Response is null/undefined:', { 
        orgCharts, 
        isLoading: loadingOrgCharts,
        userProfileId: userProfile?.id 
      });
    }
  }, [orgCharts, loadingOrgCharts, userProfile?.id]);

  // Create new org chart mutation - simplified payload
  const { mutateAsync: createOrgChart, isPending: creatingOrgChart } = useBackendMutation<
    {
      name: string;
      chart_data: any;
      website?: string;
      account_intel?: string;
      narrative?: string;
    },
    OrgChartAPI
  >("org-charts/", "POST", {
    onSuccess: (data) => {
      // Don't auto-select the new chart - keep all accounts visible
      setShowCreateNew(false);
      setNewOrgChartData({ name: '', account_intel: '', website: '', narrative: '' });
      refetchOrgCharts();
    },
  });

  // Update org chart mutation
  const { mutateAsync: updateOrgChart } = useBackendMutation<
    {
      id: number;
      name?: string;
      chart_data?: any;
      account_intel?: string;
      narrative?: string;
    },
    OrgChartAPI
  >((data) => `org-charts/${data.id}/`, "PATCH", {
    onSuccess: () => {
      refetchOrgCharts();
    },
  });

  // Handler to update narrative
  const handleNarrativeUpdate = async (newNarrative: string) => {
    if (!selectedOrgChart) return;
    try {
      const updatedChart = await updateOrgChart({
        id: selectedOrgChart.id,
        narrative: newNarrative,
      });
      setSelectedOrgChart(updatedChart);
    } catch (error) {
      console.error('Failed to update narrative:', error);
    }
  };

  // Delete org chart mutation
  const { mutateAsync: deleteOrgChart, isPending: isDeletingOrgChart } = useBackendMutation<
    { id: number },
    { success: boolean }
  >((data) => `org-charts/${data.id}/`, "DELETE", {
    onSuccess: () => {
      refetchOrgCharts();
      // If the deleted chart was selected, clear the selection
      if (selectedOrgChart && deleteConfirmationModal.orgChart?.id === selectedOrgChart.id) {
        setSelectedOrgChart(null);
        setOrgChartNodes([]); // Clear the chart view
        setCompanyName('');
        setWebsite('');
        setSelectedCompanyId(null);
        lastSearchedOrgChartId.current = null;
        // Clear the cached company ID for the deleted chart
        companyIdCache.current.delete(deleteConfirmationModal.orgChart.id);
      }
    },
  });

  // HubSpot company search
  const {
    data: companySearchData,
    isLoading: isSearchingCompany,
    refetch: searchCompany,
  } = useHubspotCompanySearch(
    userProfile?.id,
    companyName,
    website,
    {
      enabled: false, // Only search when button is clicked
    }
  );

  const searchedCompany = companySearchData?.results?.data?.[0];

  // Fetch employees for the found company
  const {
    data: hubspotEmployeesData,
    isLoading: loadingEmployees,
    error: hubspotEmployeesError,
  } = useHubspotEmployees(
    userProfile?.id || 0,
    selectedCompanyId || "",
    {
      enabled: !!(selectedCompanyId && userProfile?.id),
    },
    undefined,
    false, // fetchAll = false for pagination
    employeeCursor,
  );

  const hubspotEmployees = allEmployees.length > 0 ? allEmployees : (hubspotEmployeesData?.results?.data || []);

  // Handle initial employee data load
  useEffect(() => {
    if (hubspotEmployeesData?.results?.data && !employeeCursor) {
      console.log('📥 Initial employees loaded:', {
        count: hubspotEmployeesData.results.data.length,
        nextCursor: hubspotEmployeesData.pagination?.nextCursor,
        hasMore: hubspotEmployeesData.pagination?.hasMore,
      });
      setAllEmployees(hubspotEmployeesData.results.data);
      setEmployeeNextCursor(hubspotEmployeesData.pagination?.nextCursor);
      setEmployeeHasMore(!!hubspotEmployeesData.pagination?.hasMore);
    }
  }, [hubspotEmployeesData, employeeCursor]);

  // Handle loading more employees
  useEffect(() => {
    if (hubspotEmployeesData?.results?.data && employeeCursor && isLoadingMoreEmployees) {
      console.log('📥 More employees loaded:', {
        newCount: hubspotEmployeesData.results.data.length,
        totalCount: allEmployees.length + hubspotEmployeesData.results.data.length,
        nextCursor: hubspotEmployeesData.pagination?.nextCursor,
        hasMore: hubspotEmployeesData.pagination?.hasMore,
      });
      setAllEmployees((prev) => [...prev, ...hubspotEmployeesData.results.data]);
      setEmployeeNextCursor(hubspotEmployeesData.pagination?.nextCursor);
      setEmployeeHasMore(!!hubspotEmployeesData.pagination?.hasMore);
      setIsLoadingMoreEmployees(false);
    }
  }, [hubspotEmployeesData, employeeCursor, isLoadingMoreEmployees, allEmployees.length]);

  // Reset pagination state when company changes
  useEffect(() => {
    setAllEmployees([]);
    setEmployeeCursor(undefined);
    setEmployeeNextCursor(undefined);
    setEmployeeHasMore(false);
    setIsLoadingMoreEmployees(false);
  }, [selectedCompanyId]);

  // Debug logging for component state
  console.log('🏗️ OrgCharts component render:', {
    orgChartNodesCount: orgChartNodes.length,
    showManualEntry,
    selectedOrgChart: selectedOrgChart?.name,
    selectedOrgChartId: selectedOrgChart?.id,
    searchedCompany: searchedCompany?.name,
    selectedCompanyId,
    cachedCompanyIds: Array.from(companyIdCache.current.entries()),
    lastSearchedOrgChartId: lastSearchedOrgChartId.current,
    hubspotEmployeesCount: hubspotEmployees.length
  });

  // Update selected company when search results change
  useEffect(() => {
    if (searchedCompany && selectedOrgChart) {
      console.log('✅ Found HubSpot company:', searchedCompany);
      setSelectedCompanyId(searchedCompany.id);
      // Cache the company ID for this org chart
      companyIdCache.current.set(selectedOrgChart.id, searchedCompany.id);
      console.log('💾 Cached company ID for org chart:', { orgChartId: selectedOrgChart.id, companyId: searchedCompany.id });
    }
  }, [searchedCompany, selectedOrgChart]);

  // Reset ref when org chart is deselected
  useEffect(() => {
    if (!selectedOrgChart) {
      lastSearchedOrgChartId.current = null;
    }
  }, [selectedOrgChart]);

  // Automatically search for company in HubSpot when org chart is loaded
  useEffect(() => {
    if (
      selectedOrgChart && 
      userProfile?.id && 
      lastSearchedOrgChartId.current !== selectedOrgChart.id
    ) {
      // Check if we have a cached company ID for this org chart
      const cachedCompanyId = companyIdCache.current.get(selectedOrgChart.id);
      
      if (cachedCompanyId) {
        // We already have a cached company ID, just restore it and mark as searched
        console.log('🔄 Using cached company ID, skipping auto-search:', { 
          orgChartId: selectedOrgChart.id,
          cachedCompanyId 
        });
        setSelectedCompanyId(cachedCompanyId);
        lastSearchedOrgChartId.current = selectedOrgChart.id;
      } else {
        // No cache, perform auto-search
        const hasSearchParams = companyName || website;
        if (hasSearchParams) {
          console.log('🔍 Auto-searching for company in HubSpot:', { 
            orgChartId: selectedOrgChart.id,
            companyName, 
            website 
          });
          
          // Mark this org chart as searched
          lastSearchedOrgChartId.current = selectedOrgChart.id;
          
          // Reset previous company selection before new search
          setSelectedCompanyId(null);
          
          // Trigger the search
          searchCompany().then((result) => {
            console.log('🔍 Auto-search completed:', result.data);
          }).catch((error) => {
            console.error('🔍 Auto-search failed:', error);
          });
        }
      }
    }
  }, [selectedOrgChart, companyName, website, userProfile?.id]);

  const handleSearchCompany = async () => {
    if (!companyName && !website) {
      showAlert("Missing Information", "Please enter a company name or website", "warning");
      return;
    }
    
    // Reset previous selection
    setSelectedCompanyId(null);
    
    // Trigger the search
    const result = await searchCompany();
    
    if (result.data?.results?.data?.length === 0) {
      showAlert(
        "Company Not Found",
        "No company found in HubSpot with the provided information. Please check the company name or website.",
        "warning"
      );
    } else if (result.data?.results?.data && result.data.results.data.length > 1) {
      // If multiple results, we'll just use the first one but notify the user
      showAlert(
        "Multiple Results",
        `Found ${result.data.results.data.length} companies. Using the first match: ${result.data.results.data[0].name}`,
        "info"
      );
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    console.log('🎯 Main handleDrop triggered:', {
      clientX: e.clientX,
      clientY: e.clientY,
      target: e.target,
      currentTarget: e.currentTarget,
      dataTransferTypes: Array.from(e.dataTransfer.types)
    });
    
    e.preventDefault();

    try {
      const contactData = e.dataTransfer.getData('application/json');
      console.log('📄 Main drop - contact data:', contactData ? 'Found' : 'Not found');
      
      if (!contactData) {
        console.warn('⚠️ Main drop - no contact data found');
        return;
      }
      
      const contact: Contact = JSON.parse(contactData);
      console.log('✅ Main drop - parsed contact:', {
        contactName: `${contact.firstname} ${contact.lastname}`,
        contactId: contact.id
      });

      // Check if contact is already in org chart
      if (orgChartNodes.some(node => node.contact.id === contact.id)) {
        console.warn('⚠️ Contact already in org chart:', contact.id);
        return;
      }

      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const rawX = e.clientX - rect.left;
      const rawY = e.clientY - rect.top;

      // Apply level snapping (same logic as drag over)
      const freeformLevel = rawY / LEVEL_HEIGHT;
      const closestLevel = Math.max(0, Math.min(4, Math.round(freeformLevel))); // Clamp to 0-4
      const snappedY = closestLevel * LEVEL_HEIGHT;

      const initialX = Math.max(0, rawX - NODE_WIDTH / 2); // X remains freeform
      const initialY = snappedY; // Y snaps to level

      console.log('📍 Main drop - level snapping calculation:', {
        rect,
        rawX, rawY,
        freeformLevel,
        closestLevel,
        snappedY,
        initialX, 
        initialY,
        NODE_WIDTH, 
        NODE_HEIGHT, 
        LEVEL_HEIGHT
      });

      // Find non-overlapping position using collision detection
      const finalPosition = findNearestNonOverlappingPosition(
        { x: initialX, y: initialY },
        orgChartNodes,
        undefined,
        closestLevel
      );

      console.log('🎯 Collision detection result:', {
        initialPosition: { x: initialX, y: initialY },
        finalPosition,
        adjustmentMade: initialX !== finalPosition.x || initialY !== finalPosition.y
      });

      const newNode: OrgChartNode = {
        id: `node-${contact.id}`,
        contact,
        position: finalPosition,
        level: closestLevel // Use calculated level directly
      };

      console.log('🆕 Creating new node with collision detection:', newNode);

      const newNodes = [...orgChartNodes, newNode];
      setOrgChartNodes(newNodes);
      
      console.log('✅ Main drop - node added successfully with collision detection. Total nodes:', newNodes.length);
    } catch (error) {
      console.error('❌ Main drop - error parsing dropped data:', error);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    console.log('👆 Main drag over:', {
      clientX: e.clientX,
      clientY: e.clientY,
      target: e.target
    });
    
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleNodeRemove = (nodeId: string) => {
    console.log('🗑️ Removing node:', { nodeId });
    
    const nodeToRemove = orgChartNodes.find(node => node.id === nodeId);
    if (nodeToRemove) {
      console.log('🗑️ Node being removed:', {
        nodeName: `${nodeToRemove.contact.firstname} ${nodeToRemove.contact.lastname}`,
        position: nodeToRemove.position,
        level: nodeToRemove.level
      });
    }
    
    setOrgChartNodes(prev => {
      const newNodes = prev.filter(node => node.id !== nodeId);
      console.log('✅ Node removed. Remaining nodes:', newNodes.length);
      return newNodes;
    });
  };

  const handleNodeMove = (nodeId: string, newPosition: { x: number; y: number }) => {
    console.log('🚚 Moving node - entry:', { 
      nodeId, 
      newPosition,
      caller: 'handleNodeMove'
    });
    
    // Find the current node to show before/after comparison
    const currentNode = orgChartNodes.find(node => node.id === nodeId);
    console.log('🔍 Current node state before update:', {
      nodeId,
      currentNode: currentNode ? {
        position: currentNode.position,
        level: currentNode.level,
        contactName: `${currentNode.contact.firstname} ${currentNode.contact.lastname}`
      } : 'NOT FOUND'
    });

    // Find non-overlapping position using collision detection
    const adjustedPosition = findNearestNonOverlappingPosition(
      newPosition,
      orgChartNodes,
      nodeId // Exclude the node being moved from collision detection
    );

    console.log('🎯 Node move collision detection:', {
      requestedPosition: newPosition,
      adjustedPosition,
      adjustmentMade: newPosition.x !== adjustedPosition.x || newPosition.y !== adjustedPosition.y
    });
    
    setOrgChartNodes(prev => {
      const updatedNodes = prev.map(node => {
        if (node.id === nodeId) {
          const newLevel = Math.floor(adjustedPosition.y / 150);
          const oldLevel = node.level;
          
          // Auto-assign parent if level changed and there's only one node in level above
          let newParentId = node.parentId; // Keep existing parent by default
          
          if (newLevel !== oldLevel && newLevel > 0) {
            // Check if there's exactly one node in the level above
            const nodesInLevelAbove = prev.filter(n => 
              n.id !== nodeId && // Exclude the node being moved
              n.level === newLevel - 1
            );
            
            if (nodesInLevelAbove.length === 1) {
              // Auto-assign the single node above as parent
              newParentId = nodesInLevelAbove[0].id;
              console.log('🔗 Auto-assigning parent:', {
                childNode: `${node.contact.firstname} ${node.contact.lastname}`,
                parentNode: `${nodesInLevelAbove[0].contact.firstname} ${nodesInLevelAbove[0].contact.lastname}`,
                newLevel,
                parentLevel: nodesInLevelAbove[0].level,
                oldParentId: node.parentId,
                newParentId
              });
            } else if (nodesInLevelAbove.length === 0) {
              // No nodes in level above, clear parent
              newParentId = undefined;
              console.log('🔗 Clearing parent - no nodes in level above:', {
                childNode: `${node.contact.firstname} ${node.contact.lastname}`,
                newLevel,
                oldParentId: node.parentId
              });
            } else {
              // Multiple nodes in level above, keep existing parent or clear if inappropriate
              const currentParent = prev.find(n => n.id === node.parentId);
              if (currentParent && currentParent.level !== newLevel - 1) {
                // Current parent is not in the level above, clear it
                newParentId = undefined;
                console.log('🔗 Clearing inappropriate parent:', {
                  childNode: `${node.contact.firstname} ${node.contact.lastname}`,
                  newLevel,
                  oldParentLevel: currentParent.level,
                  expectedParentLevel: newLevel - 1
                });
              }
            }
          }
          
          const updatedNode = {
            ...node,
            position: {
              x: Math.max(0, adjustedPosition.x),
              y: Math.max(0, adjustedPosition.y)
            },
            level: Math.max(0, newLevel),
            parentId: newParentId
          };
          
          console.log('📍 Node position updated with collision detection and auto-parent assignment:', {
            nodeId,
            oldPosition: node.position,
            newPosition: updatedNode.position,
            oldLevel: node.level,
            newLevel: updatedNode.level,
            oldParentId: node.parentId,
            newParentId: updatedNode.parentId,
            originalRequest: newPosition,
            adjustedPosition,
            levelCalculation: {
              inputY: adjustedPosition.y,
              divided: adjustedPosition.y / 150,
              floored: Math.floor(adjustedPosition.y / 150),
              maxed: Math.max(0, Math.floor(adjustedPosition.y / 150))
            }
          });
          
          return updatedNode;
        }
        return node;
      });
      
      console.log('🔄 All nodes after update:', updatedNodes.map(n => ({
        id: n.id,
        name: `${n.contact.firstname} ${n.contact.lastname}`,
        position: n.position,
        level: n.level,
        parentId: n.parentId
      })));
      
      return updatedNodes;
    });
    
    console.log('✅ Node move completed with collision detection and auto-parent assignment');
  };

  const handleNodeAdd = (newNode: OrgChartNode) => {
    console.log('➕ Adding node from drag and drop:', {
      nodeId: newNode.id,
      contactName: `${newNode.contact.firstname} ${newNode.contact.lastname}`,
      position: newNode.position,
      level: newNode.level
    });

    // Check if contact is already in org chart
    if (orgChartNodes.some(node => node.contact.id === newNode.contact.id)) {
      console.warn('⚠️ Contact already in org chart:', newNode.contact.id);
      return;
    }

    const newNodes = [...orgChartNodes, newNode];
    setOrgChartNodes(newNodes);
    
    console.log('✅ Node added successfully via drag and drop. Total nodes:', newNodes.length);
  };

  // Function to detect if there are unsaved changes
  const hasUnsavedChanges = () => {
    // If there are no nodes, no unsaved changes
    if (orgChartNodes.length === 0) return false;
    
    // If there are nodes but no initial nodes (new chart not yet saved)
    if (orgChartNodes.length > 0 && initialOrgChartNodes.length === 0 && !selectedOrgChart) {
      return true;
    }
    
    // If editing an existing chart, compare with initial state
    if (selectedOrgChart && orgChartNodes.length !== initialOrgChartNodes.length) {
      return true;
    }
    
    // Deep comparison of nodes (simplified check based on contact IDs and positions)
    if (selectedOrgChart && orgChartNodes.length === initialOrgChartNodes.length) {
      const currentIds = orgChartNodes.map(n => n.contact.id).sort().join(',');
      const initialIds = initialOrgChartNodes.map(n => n.contact.id).sort().join(',');
      return currentIds !== initialIds;
    }
    
    return false;
  };

  const clearOrgChart = () => {
    // Check for unsaved changes
    if (hasUnsavedChanges()) {
      setSaveConfirmationModal({
        isOpen: true,
        action: () => {
          // Actually clear the chart
          setOrgChartNodes([]);
          setInitialOrgChartNodes([]);
        }
      });
    } else {
      // No unsaved changes, clear directly
      setOrgChartNodes([]);
      setInitialOrgChartNodes([]);
    }
  };

  const saveOrgChart = async () => {
    // Allow saving empty org charts (users may want to clear all nodes)
    
    // Helper function to build hierarchical tree structure
    const buildHierarchy = (nodes: OrgChartNode[]) => {
      // Sort nodes by level to ensure proper hierarchy
      const sortedNodes = [...nodes].sort((a, b) => a.level - b.level);
      
      // Find the root node (lowest level)
      const minLevel = Math.min(...sortedNodes.map(n => n.level));
      const rootCandidates = sortedNodes.filter(n => n.level === minLevel);
      
      // If no clear root, create a virtual one
      if (rootCandidates.length === 0) {
        return null;
      }
      
      // Take the first root candidate as the actual root
      const rootNode = rootCandidates[0];
      
      // Keep track of nodes that have been included in the hierarchy
      const includedNodeIds = new Set<string>();
      
      const buildNodeStructure = (node: OrgChartNode, allNodes: OrgChartNode[]): any => {
        includedNodeIds.add(node.id);
        
        // Find direct children using ONLY explicit parentId relationships
        // Remove proximity-based detection entirely
        const directChildren = allNodes.filter(n => 
          n.parentId === node.id && // Only use explicit parent relationship
          !includedNodeIds.has(n.id) // Don't include already processed nodes
        );

        return {
          id: node.id,
          position: {
            title: node.contact.properties?.jobtitle?.value || "No Title",
            department: node.contact.properties?.company?.value || "Unknown",
            level: node.level + 1 // API uses 1-based indexing
          },
          person: {
            name: `${node.contact.firstname} ${node.contact.lastname}`,
            email: node.contact.email,
            employee_id: node.contact.id,
            linkedin_url: node.contact.properties?.linkedin_profile?.value || ""
          },
          children: directChildren.map(child => buildNodeStructure(child, allNodes))
        };
      };

      const hierarchyRoot = buildNodeStructure(rootNode, sortedNodes);
      
      // Find any nodes that weren't included in the hierarchy
      const orphanedNodes = sortedNodes.filter(n => !includedNodeIds.has(n.id));
      
      // If there are orphaned nodes, attach them as children of the root
      if (orphanedNodes.length > 0) {
        const orphanedChildren = orphanedNodes.map(node => ({
          id: node.id,
          position: {
            title: node.contact.properties?.jobtitle?.value || "No Title",
            department: node.contact.properties?.company?.value || "Unknown",
            level: node.level + 1 // API uses 1-based indexing
          },
          person: {
            name: `${node.contact.firstname} ${node.contact.lastname}`,
            email: node.contact.email,
            employee_id: node.contact.id,
            linkedin_url: node.contact.properties?.linkedin_profile?.value || ""
          },
          children: []
        }));
        
        // Add orphaned nodes to the root's children
        hierarchyRoot.children = [...hierarchyRoot.children, ...orphanedChildren];
      }

      return hierarchyRoot;
    };

    // Create chart data structure with hierarchy
    const companyName = searchedCompany?.name || 'Organization';
    const timestamp = new Date().toISOString();
    
    // Build the hierarchical structure
    const hierarchyRoot = buildHierarchy(orgChartNodes);

    // Convert nodes to API format
    const chartData = {
      version: "1.0",
      metadata: {
        name: selectedOrgChart?.name || `${companyName} Org Chart`,
        account_intel: selectedOrgChart?.account_intel || `Organization chart with ${orgChartNodes.length} employees`,
        created_at: selectedOrgChart?.chart_data?.metadata?.created_at || timestamp,
        last_modified: timestamp
      },
      root_node: hierarchyRoot || {
        // Fallback if hierarchy building fails
        id: "organization-root",
        position: {
          title: "Organization",
          department: companyName,
          level: 1
        },
        person: {
          name: companyName,
          email: "",
          employee_id: "org-root",
          linkedin_url: ""
        },
        children: orgChartNodes.map(node => ({
          id: node.id,
          position: {
            title: node.contact.properties?.jobtitle?.value || "No Title",
            department: node.contact.properties?.company?.value || companyName,
            level: node.level + 1
          },
          person: {
            name: `${node.contact.firstname} ${node.contact.lastname}`,
            email: node.contact.email,
            employee_id: node.contact.id,
            linkedin_url: node.contact.properties?.linkedin_profile?.value || ""
          },
          children: []
        }))
      }
    };
    
    console.log('💾 Final chartData structure to be saved:', {
      hasHierarchyRoot: !!hierarchyRoot,
      rootNodeId: chartData.root_node.id,
      totalChildrenInRoot: chartData.root_node.children.length,
      metadata: chartData.metadata,
      allChildrenIds: chartData.root_node.children.map((c: any) => c.id),
      allChildrenNames: chartData.root_node.children.map((c: any) => c.person.name)
    });

    try {
      if (selectedOrgChart) {
        // Update existing org chart using the proper mutation
        const updatedChart = await updateOrgChart({
          id: selectedOrgChart.id,
          name: selectedOrgChart.name,
          chart_data: chartData,
          account_intel: selectedOrgChart.account_intel || ""
        });
        
        setSelectedOrgChart(updatedChart);
        setInitialOrgChartNodes([...orgChartNodes]); // Update initial state after successful save
        showAlert("Chart Updated", `Updated "${selectedOrgChart.name}" successfully!`, "success");
      } else {
        // Create new org chart - show the comprehensive form modal
        const companyName = searchedCompany?.name || 'Organization';
        showSaveChartModal(`${companyName} Chart`);
        
        // Store the chart data to be used when form is submitted
        (window as any).__pendingChartData = chartData;
      }
    } catch (error) {
      console.error('Save error:', error);
      showAlert("Save Failed", `Failed to save: ${error instanceof Error ? error.message : 'Unknown error occurred'}`, "error");
    }
  };

  // Function to create a manual contact and add to org chart
  const handleAddManualPerson = (personData: {
    firstName: string;
    lastName: string;
    jobTitle: string;
    email: string;
    level: number;
    parentId?: string;
  }) => {
    console.log('👤 Adding manual person:', personData);
    
    // Generate a unique ID for the manual contact
    const manualId = `manual-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    console.log('🆔 Generated manual ID:', manualId);

    // Create a contact object that matches the Contact interface
    const manualContact: Contact = {
      id: manualId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      firstname: personData.firstName,
      lastname: personData.lastName,
      email: personData.email,
      properties: {
        firstname: { value: personData.firstName, label: personData.firstName },
        lastname: { value: personData.lastName, label: personData.lastName },
        email: { value: personData.email, label: personData.email },
        jobtitle: { value: personData.jobTitle, label: personData.jobTitle },
        company: { value: 'Manual Entry', label: 'Manual Entry' }
      }
    };

    console.log('📝 Created manual contact:', manualContact);

    // Calculate initial position - place new nodes in a column starting from the specified level
    const existingNodesAtLevel = orgChartNodes.filter(node => node.level === personData.level);
    const initialX = 300 + (existingNodesAtLevel.length * 220); // Spread horizontally
    const initialY = personData.level * LEVEL_HEIGHT; // Snap to exact level position

    // Find non-overlapping position using collision detection
    const finalPosition = findNearestNonOverlappingPosition(
      { x: initialX, y: initialY },
      orgChartNodes,
      undefined,
      personData.level // Prefer to stay at the same level
    );

    console.log('📍 Manual person position calculation with collision detection:', {
      level: personData.level,
      existingNodesAtLevel: existingNodesAtLevel.length,
      initialPosition: { x: initialX, y: initialY },
      finalPosition,
      adjustmentMade: initialX !== finalPosition.x || initialY !== finalPosition.y,
      LEVEL_HEIGHT,
      snappedToLevel: personData.level,
      parentId: personData.parentId
    });

    const newNode: OrgChartNode = {
      id: `node-${manualId}`,
      contact: manualContact,
      position: finalPosition,
      level: personData.level,
      parentId: personData.parentId
    };

    console.log('🆕 Created manual node with collision detection:', newNode);

    const newNodes = [...orgChartNodes, newNode];
    setOrgChartNodes(newNodes);
    
    console.log('✅ Manual person added successfully with collision detection. Total nodes:', newNodes.length);
    console.log('🔍 Current orgChartNodes state after addition:', {
      totalNodes: newNodes.length,
      newNodeId: newNode.id,
      allNodeIds: newNodes.map(n => n.id),
      newNodeDetails: {
        name: `${newNode.contact.firstname} ${newNode.contact.lastname}`,
        level: newNode.level,
        position: newNode.position
      }
    });
  };

  // Handlers for org chart management - simplified
  const handleUpdateNewOrgChartData = (updates: Partial<{name: string; account_intel: string; website: string; narrative: string}>) => {
    setNewOrgChartData(prev => ({ ...prev, ...updates }));
  };

  const handleCreateOrgChart = async () => {
    if (!newOrgChartData.name) {
      showAlert("Validation Error", "Chart name is required", "error");
      return;
    }

    // Validate website if provided
    if (newOrgChartData.website) {
      const websiteError = validateWebsiteUrl(newOrgChartData.website);
      if (websiteError) {
        showAlert("Validation Error", websiteError, "error");
        return;
      }
    }
    
    try {
      await createOrgChart({
        name: newOrgChartData.name,
        website: newOrgChartData.website || undefined,
        account_intel: newOrgChartData.account_intel || "",
        narrative: newOrgChartData.narrative || undefined,
        chart_data: {
          version: "1.0",
          metadata: {
            name: newOrgChartData.name,
            account_intel: newOrgChartData.account_intel || "",
            created_at: new Date().toISOString(),
            last_modified: new Date().toISOString()
          },
          root_node: {
            id: "virtual-root",
            person: {
              name: `${newOrgChartData.name} Organization`,
              email: "",
              employee_id: "virtual-root",
              linkedin_url: ""
            },
            children: [],
            position: {
              level: 1,
              title: "Organization Root",
              department: newOrgChartData.name
            }
          }
        }
      });
    } catch (error) {
      console.error('Create org chart error:', error);
      
      // Check if it's a 400 error indicating duplicate name
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      const isNetworkError = error && typeof error === 'object' && 'response' in error;
      const status = isNetworkError ? (error as any).response?.status : null;
      
      if (status === 400 && (
        errorMessage.toLowerCase().includes('already exists') ||
        errorMessage.toLowerCase().includes('duplicate') ||
        errorMessage.toLowerCase().includes('name') ||
        errorMessage.toLowerCase().includes('already in use')
      )) {
        showAlert(
          "Chart Name Already Exists", 
          `A chart named "${newOrgChartData.name}" already exists for your company. Please choose a different name and try again.`, 
          "warning"
        );
      } else {
        showAlert("Creation Failed", `Failed to create chart: ${errorMessage}`, "error");
      }
    }
  };

  // Edit org chart modal handlers
  const handleEditOrgChart = (orgChart: OrgChartAPI) => {
    setEditOrgChartModal({
      isOpen: true,
      orgChart: orgChart
    });
  };

  const handleCloseEditModal = () => {
    setEditOrgChartModal({
      isOpen: false,
      orgChart: null
    });
  };

  const handleEditOrgChartSave = (updatedOrgChart: OrgChartAPI) => {
    // Update the selected org chart if it's the one being edited
    if (selectedOrgChart?.id === updatedOrgChart.id) {
      setSelectedOrgChart(updatedOrgChart);
    }
    // Refetch org charts to update the list
    refetchOrgCharts();
    showAlert("Chart Updated", `Successfully updated "${updatedOrgChart.name}"`, "success");
  };

  // Delete org chart modal handlers
  const handleDeleteOrgChart = (orgChart: OrgChartAPI) => {
    setDeleteConfirmationModal({
      isOpen: true,
      orgChart: orgChart
    });
  };

  const handleCloseDeleteModal = () => {
    setDeleteConfirmationModal({
      isOpen: false,
      orgChart: null
    });
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirmationModal.orgChart) return;

    try {
      await deleteOrgChart({ id: deleteConfirmationModal.orgChart.id });
      showAlert("Chart Deleted", `Successfully deleted "${deleteConfirmationModal.orgChart.name}"`, "success");
      handleCloseDeleteModal();
    } catch (error) {
      console.error('Error deleting org chart:', error);
      showAlert("Delete Failed", `Failed to delete chart: ${error instanceof Error ? error.message : 'Unknown error'}`, "error");
    }
  };

  // Save confirmation modal handlers
  const handleShowSaveConfirmation = (action: () => void) => {
    setSaveConfirmationModal({
      isOpen: true,
      action
    });
  };

  const handleCloseSaveConfirmation = () => {
    setSaveConfirmationModal({
      isOpen: false,
      action: null
    });
  };

  const handleSaveAndClear = async () => {
    // Save the chart first
    await saveOrgChart();
    // Then execute the clear action
    if (saveConfirmationModal.action) {
      saveConfirmationModal.action();
    }
    handleCloseSaveConfirmation();
  };

  const handleDiscardAndClear = () => {
    // Execute the clear action without saving
    if (saveConfirmationModal.action) {
      saveConfirmationModal.action();
    }
    handleCloseSaveConfirmation();
  };

  // Handle account intel updates
  const handleUpdateAccountIntel = async (chartId: number, newAccountIntel: string) => {
    console.log('🔄 handleUpdateAccountIntel called:', { chartId, newAccountIntel, newAccountIntelLength: newAccountIntel.length });
    
    try {
      const chartToUpdate = orgCharts?.find(chart => chart.id === chartId);
      if (!chartToUpdate) {
        console.error('❌ Chart not found for ID:', chartId);
        throw new Error('Chart not found');
      }

      console.log('📊 Chart to update found:', {
        id: chartToUpdate.id,
        name: chartToUpdate.name,
        currentAccountIntel: chartToUpdate.account_intel,
        currentAccountIntelLength: chartToUpdate.account_intel?.length || 0
      });

      // Update the chart data metadata timestamp
      const updatedChartData = {
        ...(chartToUpdate.chart_data || {}),
        metadata: {
          ...(chartToUpdate.chart_data?.metadata || {}),
          last_modified: new Date().toISOString()
        }
      };

      console.log('📝 Sending update request with data:', {
        id: chartId,
        name: chartToUpdate.name,
        account_intel: newAccountIntel,
        updatedChartData: {
          version: updatedChartData.version,
          metadata: updatedChartData.metadata
        }
      });

      const patchPayload = {
        id: chartId,
        name: chartToUpdate.name,
        chart_data: updatedChartData,
        account_intel: newAccountIntel
      };
      
      console.log('🚀 Full PATCH payload being sent:', JSON.stringify(patchPayload, null, 2));
      
      const updateResult = await updateOrgChart(patchPayload);

      console.log('✅ Update result:', updateResult);

      // If this is the currently selected chart, update it
      if (selectedOrgChart?.id === chartId) {
        const updatedSelectedChart = {
          ...chartToUpdate,
          account_intel: newAccountIntel, // Update account_intel at top level
          chart_data: updatedChartData
        };
        console.log('🔄 Updating selected chart:', updatedSelectedChart);
        setSelectedOrgChart(updatedSelectedChart);
      }

      console.log('🎉 Account intel update completed successfully');
      showAlert("Account Intel Updated", "Account intelligence has been updated successfully", "success");
    } catch (error) {
      console.error('❌ Failed to update account intel:', error);
      showAlert("Update Failed", `Failed to update account intel: ${error instanceof Error ? error.message : 'Unknown error'}`, "error");
      throw error; // Re-throw to let the component handle loading states
    }
  };

  const handleLoadOrgChart = (orgChart: OrgChartAPI) => {
    // Helper function to convert API node to Contact format
    const convertToContact = (node: any, nodeIndex: number): Contact => {
      const id = node.person?.employee_id || `loaded-${nodeIndex}`;
      const [firstName, ...lastNameParts] = (node.person?.name || 'Unknown Person').split(' ');
      const lastName = lastNameParts.join(' ') || '';
      
      return {
        id: id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        firstname: firstName,
        lastname: lastName,
        email: node.person?.email || '',
        properties: {
          firstname: { value: firstName, label: firstName },
          lastname: { value: lastName, label: lastName },
          email: { value: node.person?.email || '', label: node.person?.email || '' },
          jobtitle: { value: node.position?.title || 'No Title', label: node.position?.title || 'No Title' },
          company: { value: node.position?.department || 'Unknown', label: node.position?.department || 'Unknown' },
          linkedin_profile: { value: node.person?.linkedin_url || '', label: node.person?.linkedin_url || '' }
        }
      };
    };

    // Helper function to flatten the hierarchical structure
    const flattenNodes = (rootNode: any): OrgChartNode[] => {
      const nodes: OrgChartNode[] = [];
      const processedNodeIds = new Set<string>(); // Track processed nodes to prevent duplicates
      const levelPositions = new Map<number, number[]>(); // Track occupied X positions at each level
      let nodeCounter = 0;
      
      // Position constants for layout
      const LEVEL_HEIGHT_LOCAL = 150;
      const NODE_SPACING = 220;
      const MIN_NODE_SPACING = 200; // Minimum space between nodes to prevent overlap
      
      // Function to find a non-overlapping position at a given level
      const findNonOverlappingPosition = (level: number, preferredX: number): number => {
        const occupiedPositions = levelPositions.get(level) || [];
        
        // If no positions occupied at this level, use preferred position
        if (occupiedPositions.length === 0) {
          levelPositions.set(level, [preferredX]);
          return preferredX;
        }
        
        // Check if preferred position conflicts with existing positions
        let finalX = preferredX;
        let hasConflict = true;
        let attempts = 0;
        const maxAttempts = 20; // Prevent infinite loops
        
        while (hasConflict && attempts < maxAttempts) {
          hasConflict = false;
          
          for (const occupiedX of occupiedPositions) {
            if (Math.abs(finalX - occupiedX) < MIN_NODE_SPACING) {
              hasConflict = true;
              // Move to the right of the conflicting position
              finalX = occupiedX + MIN_NODE_SPACING;
              break;
            }
          }
          attempts++;
        }
        
        // Add the final position to occupied positions for this level
        const updatedPositions = [...occupiedPositions, finalX].sort((a, b) => a - b);
        levelPositions.set(level, updatedPositions);
        
        return finalX;
      };
      
      const traverseNode = (node: any, level: number, xOffset: number, parentNodeId?: string) => {
        if (!node) return xOffset;
        
        // Skip virtual/organization root nodes
        if (node.id === 'virtual-root' || node.id === 'organization-root' || node.id === 'org-root' || node.id === 'root') {
          // Process children of virtual root
          if (node.children && node.children.length > 0) {
            let currentX = 100; // Start position
            node.children.forEach((child: any) => {
              currentX = traverseNode(child, level, currentX);
            });
          }
          return xOffset;
        }
        
        // Get node ID for duplicate checking
        const nodeId = node.person?.employee_id || node.id || `unknown-${nodeCounter}`;
        
        // Skip if we've already processed this node
        if (processedNodeIds.has(nodeId)) {
          console.log(`⚠️ Skipping duplicate node: ${nodeId} (${node.person?.name})`);
          // Still process children but don't add this node again
          let childX = xOffset;
          if (node.children && node.children.length > 0) {
            const currentNodeId = `node-${nodeId}`;
            node.children.forEach((child: any, index: number) => {
              const childXPosition = xOffset + (index * NODE_SPACING);
              childX = traverseNode(child, level + 1, childXPosition, currentNodeId);
            });
          }
          return childX + NODE_SPACING;
        }
        
        // Mark this node as processed
        processedNodeIds.add(nodeId);
        
        // Find a non-overlapping position for this node
        const x = findNonOverlappingPosition(level, xOffset);
        const y = level * LEVEL_HEIGHT_LOCAL;
        
        // Convert to Contact and create OrgChartNode
        const contactData = convertToContact(node, nodeCounter++);
        const orgNode: OrgChartNode = {
          id: `node-${contactData.id}`,
          contact: contactData,
          position: { x, y },
          level: level,
          parentId: parentNodeId
        };
        
        nodes.push(orgNode);
        console.log(`✅ Added node: ${nodeId} (${node.person?.name}) at level ${level}, position (${x}, ${y})`);
        
        // Process children
        let childX = x;
        if (node.children && node.children.length > 0) {
          // Center children under parent, but adjust for non-overlapping positions
          const totalChildWidth = node.children.length * NODE_SPACING;
          const startX = x - (totalChildWidth / 2) + (NODE_SPACING / 2);
          
          node.children.forEach((child: any, index: number) => {
            const childXPosition = startX + (index * NODE_SPACING);
            traverseNode(child, level + 1, childXPosition, node.id);
          });
          
          childX = startX + (node.children.length * NODE_SPACING);
        }
        
        return Math.max(x + NODE_SPACING, childX);
      };
      
      // Start traversal from root
      if (orgChart.chart_data?.root_node) {
        traverseNode(orgChart.chart_data.root_node, 0, 100, undefined);
      }
      
      console.log(`📊 Loaded ${nodes.length} unique nodes (${processedNodeIds.size} processed, duplicates prevented)`);
      console.log(`📍 Level positions:`, Array.from(levelPositions.entries()));
      return nodes;
    };

    try {
      // Check if chart has data to load
      if (!orgChart.chart_data?.root_node) {
        showAlert("Empty Chart", `"${orgChart.name}" has no org chart data yet. This chart was likely created via bulk upload.`, "info");
        return;
      }

      // Transform the chart data into editor format
      const loadedNodes = flattenNodes(orgChart.chart_data.root_node);
      
      // Clear current chart and load the new one
      setOrgChartNodes(loadedNodes);
      setInitialOrgChartNodes(loadedNodes); // Track initial state for unsaved changes detection
      setSelectedOrgChart(orgChart);
      
      // Set company name and website from the loaded org chart
      setCompanyName(orgChart.name);
      setWebsite(orgChart.website || '');
      
      // Note: The cached company ID will be restored by the auto-search effect
      
      // Show success message
      showAlert("Chart Loaded", `Loaded "${orgChart.name}" with ${loadedNodes.length} people`, "success");
      
      console.log('Successfully loaded org chart:', {
        chartName: orgChart.name,
        nodeCount: loadedNodes.length,
        nodes: loadedNodes
      });
      
    } catch (error) {
      console.error('Error loading org chart:', error);
      showAlert("Load Failed", "Failed to load org chart. The data may be corrupted.", "error");
    }
  };

  // AI-powered org chart generation
  const handleAIGenerateOrgChart = async () => {
    if (!selectedOrgChart || !hubspotEmployees.length) {
      showAlert("Missing Data", "Please select an org chart and load HubSpot contacts first", "warning");
      return;
    }

    // Check for unsaved changes
    if (hasUnsavedChanges()) {
      showAlert(
        "Unsaved Changes",
        "Please save or discard current changes before generating a new org chart",
        "warning"
      );
      return;
    }

    setIsGeneratingOrgChart(true);

    try {
      // Prepare minimal contact data (name and title only)
      const contacts: Array<{ name: string; title: string; employee_id: string }> = hubspotEmployees.map(contact => ({
        name: `${contact.firstname} ${contact.lastname}`.trim(),
        title: String(contact.properties?.jobtitle?.value || 'Unknown'),
        employee_id: contact.id
      }));

      console.log('🤖 Generating AI org chart with contacts:', {
        orgChartId: selectedOrgChart.id,
        orgChartName: selectedOrgChart.name,
        contactCount: contacts.length,
        sampleContacts: contacts.slice(0, 3)
      });

      // Call backend endpoint with extended timeout for AI processing
      const response = await callBackend<
        { contacts: Array<{ name: string; title: string; employee_id: string }> },
        { chart_data: any }
      >(`org-charts/${selectedOrgChart.id}/generate_structure/`, {
        method: 'POST',
        data: { contacts },
        timeout: 300000 // 5 minutes timeout for AI processing
      });

      console.log('✅ AI generation response:', response);

      // Load generated chart into editor
      if (response.chart_data?.root_node) {
        // Reuse the existing flattenNodes logic from handleLoadOrgChart
        const flattenNodes = (rootNode: any): OrgChartNode[] => {
          const nodes: OrgChartNode[] = [];
          const processedNodeIds = new Set<string>();
          const levelPositions = new Map<number, number[]>();
          let nodeCounter = 0;
          
          const LEVEL_HEIGHT_LOCAL = 150;
          const NODE_SPACING = 220;
          const MIN_NODE_SPACING = 200;
          
          const findNonOverlappingPosition = (level: number, preferredX: number): number => {
            const occupiedPositions = levelPositions.get(level) || [];
            
            if (occupiedPositions.length === 0) {
              levelPositions.set(level, [preferredX]);
              return preferredX;
            }
            
            let finalX = preferredX;
            let hasConflict = true;
            let attempts = 0;
            const maxAttempts = 20;
            
            while (hasConflict && attempts < maxAttempts) {
              hasConflict = false;
              
              for (const occupiedX of occupiedPositions) {
                if (Math.abs(finalX - occupiedX) < MIN_NODE_SPACING) {
                  hasConflict = true;
                  finalX = occupiedX + MIN_NODE_SPACING;
                  break;
                }
              }
              attempts++;
            }
            
            const updatedPositions = [...occupiedPositions, finalX].sort((a, b) => a - b);
            levelPositions.set(level, updatedPositions);
            
            return finalX;
          };
          
          const convertToContact = (node: any, nodeIndex: number): Contact => {
            const id = node.person?.employee_id || `ai-generated-${nodeIndex}`;
            const [firstName, ...lastNameParts] = (node.person?.name || 'Unknown Person').split(' ');
            const lastName = lastNameParts.join(' ') || '';
            
            return {
              id: id,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              firstname: firstName,
              lastname: lastName,
              email: node.person?.email || '',
              properties: {
                firstname: { value: firstName, label: firstName },
                lastname: { value: lastName, label: lastName },
                email: { value: node.person?.email || '', label: node.person?.email || '' },
                jobtitle: { value: node.position?.title || 'No Title', label: node.position?.title || 'No Title' },
                company: { value: node.position?.department || 'Unknown', label: node.position?.department || 'Unknown' },
                linkedin_profile: { value: node.person?.linkedin_url || '', label: node.person?.linkedin_url || '' }
              }
            };
          };
          
          const traverseNode = (node: any, level: number, xOffset: number, parentNodeId?: string) => {
            if (!node) return xOffset;
            
            // Skip virtual/organization root nodes
            if (node.id === 'virtual-root' || node.id === 'organization-root' || node.id === 'org-root' || node.id === 'root') {
              if (node.children && node.children.length > 0) {
                let currentX = 100;
                node.children.forEach((child: any) => {
                  currentX = traverseNode(child, level, currentX);
                });
              }
              return xOffset;
            }
            
            const nodeId = node.person?.employee_id || node.id || `unknown-${nodeCounter}`;
            
            if (processedNodeIds.has(nodeId)) {
              console.log(`⚠️ Skipping duplicate node: ${nodeId} (${node.person?.name})`);
              let childX = xOffset;
              if (node.children && node.children.length > 0) {
                const currentNodeId = `node-${nodeId}`;
                node.children.forEach((child: any, index: number) => {
                  const childXPosition = xOffset + (index * NODE_SPACING);
                  childX = traverseNode(child, level + 1, childXPosition, currentNodeId);
                });
              }
              return childX + NODE_SPACING;
            }
            
            processedNodeIds.add(nodeId);
            
            const x = findNonOverlappingPosition(level, xOffset);
            const y = level * LEVEL_HEIGHT_LOCAL;
            
            const contactData = convertToContact(node, nodeCounter++);
            const orgNode: OrgChartNode = {
              id: `node-${contactData.id}`,
              contact: contactData,
              position: { x, y },
              level: level,
              parentId: parentNodeId
            };
            
            nodes.push(orgNode);
            console.log(`✅ Added AI node: ${nodeId} (${node.person?.name}) at level ${level}`);
            
            let childX = x;
            if (node.children && node.children.length > 0) {
              const totalChildWidth = node.children.length * NODE_SPACING;
              const startX = x - (totalChildWidth / 2) + (NODE_SPACING / 2);
              
              node.children.forEach((child: any, index: number) => {
                const childXPosition = startX + (index * NODE_SPACING);
                traverseNode(child, level + 1, childXPosition, orgNode.id);
              });
              
              childX = startX + (node.children.length * NODE_SPACING);
            }
            
            return Math.max(x + NODE_SPACING, childX);
          };
          
          if (response.chart_data.root_node) {
            traverseNode(response.chart_data.root_node, 0, 100, undefined);
          }
          
          console.log(`📊 AI generated ${nodes.length} unique nodes`);
          return nodes;
        };

        const loadedNodes = flattenNodes(response.chart_data.root_node);
        
        // Clear current chart and load AI-generated one
        setOrgChartNodes(loadedNodes);
        // Don't set initialOrgChartNodes - treat as new unsaved chart
        
        showAlert(
          "AI Generation Complete",
          `Generated org chart with ${loadedNodes.length} employees. Review and save when ready.`,
          "success"
        );
        
        console.log('✅ AI-generated org chart loaded successfully:', {
          nodeCount: loadedNodes.length
        });
      } else {
        throw new Error('Invalid response format from AI generation');
      }

    } catch (error) {
      console.error('❌ AI org chart generation failed:', error);
      showAlert(
        "Generation Failed",
        `Failed to generate org chart: ${error instanceof Error ? error.message : 'Unknown error'}`,
        "error"
      );
    } finally {
      setIsGeneratingOrgChart(false);
    }
  };

  const isLoading = isSearchingCompany || loadingEmployees;

  // Add handler for parent changes
  const handleParentChange = (nodeId: string, parentId: string | undefined) => {
    setOrgChartNodes(prev => 
      prev.map(node => 
        node.id === nodeId 
          ? { ...node, parentId } 
          : node
      )
    );
  };

  // Add handler for auto-layout that preserves levels and parent-child relationships
  const applyAutoLayout = (newPositions: Record<string, { x: number; y: number }>) => {
    setOrgChartNodes(prev => {
      return prev.map(node => {
        const newPosition = newPositions[node.id];
        if (newPosition) {
          return {
            ...node,
            position: {
              x: Math.max(0, newPosition.x),
              y: node.position.y // PRESERVE ORIGINAL Y POSITION TO MAINTAIN LEVEL
            }
            // Keep level and parentId unchanged
          };
        }
        return node;
      });
    });
  };

  return (
    <div className="flex flex-col min-h-screen w-full bg-gray-100">
      {/* Org Chart Selection Panel */}
      {loadingOrgCharts ? (
        <div className="bg-white border-b border-gray-200 p-6">
          <div className="flex items-center justify-center">
            <div className="animate-spin h-6 w-6 border-2 border-blue-500 rounded-full border-t-transparent mr-3"></div>
            <span className="text-gray-600">Loading org charts...</span>
          </div>
        </div>
      ) : orgCharts ? (
        <OrgChartSelectionPanel
          orgCharts={orgCharts}
          selectedOrgChart={selectedOrgChart}
          showCreateNew={showCreateNew}
          showCSVUpload={showCSVUpload}
          newOrgChartData={newOrgChartData}
          isCreating={creatingOrgChart}
          onSelectOrgChart={setSelectedOrgChart}
          onShowCreateNew={setShowCreateNew}
          onShowCSVUpload={setShowCSVUpload}
          onUpdateNewOrgChartData={handleUpdateNewOrgChartData}
          onCreateOrgChart={handleCreateOrgChart}
          onLoadOrgChart={handleLoadOrgChart}
          onEditOrgChart={handleEditOrgChart}
          onDeleteOrgChart={handleDeleteOrgChart}
          onClearEditor={() => {
            setOrgChartNodes([]);
            setInitialOrgChartNodes([]);
            setSelectedOrgChart(null);
            setCompanyName('');
            setWebsite('');
            setSelectedCompanyId(null);
            lastSearchedOrgChartId.current = null;
            // Note: We don't clear the cache here because we want to preserve
            // the company ID mapping for when the user reloads the same org chart
          }}
          onUpdateAccountIntel={handleUpdateAccountIntel}
          onRefetchOrgCharts={refetchOrgCharts}
          onShowAlert={showAlert}
          orgChartNodes={orgChartNodes}
          initialOrgChartNodes={initialOrgChartNodes}
          onShowSaveConfirmation={handleShowSaveConfirmation}
        />
      ) : userProfile?.id ? (
        <div className="bg-white border-b border-gray-200 p-6">
          <div className="text-center text-gray-500">
            <p>Unable to load org charts. Please try refreshing the page.</p>
          </div>
        </div>
      ) : (
        <div className="bg-white border-b border-gray-200 p-6">
          <div className="text-center text-gray-500">
            <p>Please log in to access org charts.</p>
          </div>
        </div>
      )}

      {/* Top Section - Organization Chart Builder (only shown when a chart is selected) */}
      {selectedOrgChart && (
      <>
      <div className="bg-white border-b border-gray-200 p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Organization Chart Builder</h1>
        
        {/* HubSpot Company Search */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-gray-700">Search HubSpot Company:</label>
          <div className="flex gap-2 items-center">
            <input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              type="text"
              name="company-name"
              id="company-name"
              autoComplete="off"
              className="block px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 flex-1"
              placeholder="Company Name"
            />
            <input
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              type="text"
              name="website"
              id="website"
              autoComplete="off"
              className="block px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 flex-1"
              placeholder="Website (e.g., example.com)"
            />
            <button
              disabled={(!companyName && !website) || isLoading}
              type="button"
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
              onClick={handleSearchCompany}
            >
              {isLoading ? 'Searching...' : 'Search Company'}
            </button>
            <button
              onClick={() => setShowManualEntry(!showManualEntry)}
              className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 whitespace-nowrap"
            >
              {showManualEntry ? 'Hide Manual Entry' : 'Add People Manually'}
            </button>
            {/* Draft with AI button - always visible when chart is selected, disabled when no employees */}
            {selectedOrgChart && (
              <button
                onClick={handleAIGenerateOrgChart}
                disabled={isGeneratingOrgChart || hubspotEmployees.length === 0}
                className="px-6 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap"
                title={hubspotEmployees.length === 0
                  ? "Load HubSpot contacts first to use AI organization"
                  : "Use AI to organize contacts into an org chart structure"
                }
              >
                {isGeneratingOrgChart ? (
                  <>
                    <div className="animate-spin h-4 w-4 border-2 border-white rounded-full border-t-transparent"></div>
                    Generating...
                  </>
                ) : (
                  <>
                    🤖 Draft with AI
                  </>
                )}
              </button>
            )}
            {/* Show save button when editing an existing chart OR when there are nodes */}
            {(selectedOrgChart || orgChartNodes.length > 0) && (
              <button
                onClick={saveOrgChart}
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center gap-2 whitespace-nowrap"
              >
                💾 {selectedOrgChart ? 'Update Chart' : 'Save New Chart'}
              </button>
            )}
            {orgChartNodes.length > 0 && (
              <button
                onClick={clearOrgChart}
                className="px-6 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 whitespace-nowrap"
              >
                Clear Chart ({orgChartNodes.length})
              </button>
            )}
          </div>
        </div>

        {/* Status Messages */}
        {searchedCompany && (
          <div className="mt-4 text-sm text-green-600">
            ✅ Found HubSpot company: {searchedCompany.name} ({searchedCompany.domain})
          </div>
        )}

        {hubspotEmployees.length > 0 && (
          <div className="mt-2 text-sm text-green-600">
            ✅ Loaded {hubspotEmployees.length} contact{hubspotEmployees.length !== 1 ? 's' : ''} from the company
          </div>
        )}

        {hubspotEmployeesError && (
          <div className="mt-2 text-sm text-red-600">
            ❌ Error loading employees: {hubspotEmployeesError.message}
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex flex-1 w-full overflow-hidden min-h-[600px]">
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin h-8 w-8 border-2 border-blue-500 rounded-full border-t-transparent mx-auto mb-4"></div>
              <p className="text-gray-500">
                {isSearchingCompany && "Searching HubSpot for company..."}
                {loadingEmployees && "Loading company contacts..."}
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Left Sidebar - Contacts List or Empty State */}
            {hubspotEmployees.length > 0 ? (
              <ContactsList
                contacts={hubspotEmployees}
                onContactSelect={setSelectedContact}
                selectedContact={selectedContact}
                orgChartNodes={orgChartNodes}
                hasMore={employeeHasMore}
                isLoadingMore={isLoadingMoreEmployees}
                onLoadMore={() => {
                  if (!employeeNextCursor || isLoadingMoreEmployees) return;
                  setIsLoadingMoreEmployees(true);
                  setEmployeeCursor(employeeNextCursor);
                }}
              />
            ) : selectedOrgChart ? (
              /* Empty state when chart is selected but no employees loaded */
              <div className="w-72 bg-white border-r border-gray-200 flex flex-col h-full">
                <div className="p-4 border-b border-gray-200">
                  <h3 className="font-semibold text-gray-800">Contacts</h3>
                </div>
                <div className="flex-1 flex flex-col items-center justify-center p-4 text-center">
                  {loadingEmployees ? (
                    <>
                      <div className="animate-spin h-8 w-8 border-2 border-blue-500 rounded-full border-t-transparent mb-3"></div>
                      <p className="text-sm text-gray-500">Loading contacts...</p>
                    </>
                  ) : hubspotEmployeesError ? (
                    <>
                      <div className="text-red-500 mb-2">
                        <svg className="w-10 h-10 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                      </div>
                      <p className="text-sm text-red-600 font-medium">Failed to load contacts</p>
                      <p className="text-xs text-gray-500 mt-1">{hubspotEmployeesError.message}</p>
                      <button
                        onClick={() => searchCompany()}
                        className="mt-3 text-sm text-blue-600 hover:text-blue-800 underline"
                      >
                        Try again
                      </button>
                    </>
                  ) : !searchedCompany ? (
                    <>
                      <div className="text-gray-400 mb-2">
                        <svg className="w-10 h-10 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                      </div>
                      <p className="text-sm text-gray-600 font-medium">Search for a company</p>
                      <p className="text-xs text-gray-500 mt-1">
                        Use the search bar above to find a HubSpot company and load its contacts
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="text-gray-400 mb-2">
                        <svg className="w-10 h-10 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                      </div>
                      <p className="text-sm text-gray-600 font-medium">No contacts found</p>
                      <p className="text-xs text-gray-500 mt-1">
                        No contacts were found for {searchedCompany.name} in HubSpot
                      </p>
                    </>
                  )}
                </div>
              </div>
            ) : null}

            {/* Center - Org Chart */}
            <div
              className="flex-1 overflow-hidden flex flex-col"
              onDrop={handleDrop}
              onDragOver={handleDragOver}
            >
              {/* Editable Narrative Field - Always visible when chart is selected */}
              {selectedOrgChart && (
                <div className="bg-white border-b border-gray-200 px-4 py-3">
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Deal Narrative
                  </label>
                  <input
                    type="text"
                    value={selectedOrgChart.narrative || ''}
                    onChange={(e) => {
                      // Optimistic update for immediate feedback
                      setSelectedOrgChart({
                        ...selectedOrgChart,
                        narrative: e.target.value
                      });
                    }}
                    onBlur={(e) => {
                      // Save on blur
                      handleNarrativeUpdate(e.target.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleNarrativeUpdate((e.target as HTMLInputElement).value);
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    placeholder="Enter a narrative title for this deal (e.g., 'Initiative to hit 3x pipeline coverage by implementing value-based messaging')"
                    className="w-full px-3 py-2 text-xl font-semibold border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    A strong narrative indicates deal quality. Press Enter or click outside to save.
                  </p>
                </div>
              )}

              {/* Org Chart Component */}
              <div className="flex-1 overflow-hidden">
                <OrgChart
                  nodes={orgChartNodes}
                  onNodeRemove={handleNodeRemove}
                  onNodeMove={handleNodeMove}
                  onNodeSelect={setSelectedNodeForInfo}
                  onAutoLayout={applyAutoLayout}
                  onNodeAdd={handleNodeAdd}
                  narrative={selectedOrgChart?.narrative}
                />
              </div>
            </div>

            {/* Right Sidebar - Manual Entry Panel */}
            {showManualEntry && (
              <ManualEntryPanel
                onAddPerson={handleAddManualPerson}
                maxLevel={orgChartNodes.length > 0 ? Math.max(...orgChartNodes.map(n => n.level)) : 0}
                availableParents={orgChartNodes}
              />
            )}
          </>
        )}
      </div>
      </>
      )}

      {/* Node Info Modal */}
      <NodeInfoModal
        node={selectedNodeForInfo}
        isOpen={!!selectedNodeForInfo}
        onClose={() => setSelectedNodeForInfo(null)}
        onParentChange={handleParentChange}
        availableParents={orgChartNodes}
      />

      {/* Custom Alert Modal */}
      <AlertModal
        isOpen={alertModal.isOpen}
        onClose={closeAlert}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
      />

      {/* Custom Prompt Modal */}
      <PromptModal
        isOpen={promptModal.isOpen}
        onClose={closePrompt}
        onConfirm={handlePromptConfirm}
        title={promptModal.title}
        message={promptModal.message}
        placeholder={promptModal.placeholder}
        defaultValue={promptModal.defaultValue}
      />

      {/* Save New Chart Modal */}
      {saveChartModal.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-900">Save New Chart</h2>
              <button
                onClick={closeSaveChartModal}
                className="text-gray-400 hover:text-gray-600"
                disabled={saveChartModal.isSaving}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); handleSaveChartSubmit(); }} className="space-y-4">
              {/* Chart Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Chart Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={saveChartModal.chartData.name}
                  onChange={(e) => updateSaveChartData({ name: e.target.value })}
                  placeholder="e.g., Q1 2024 Org Chart"
                  className={`w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    saveChartModal.errors.name ? 'border-red-500' : 'border-gray-300'
                  }`}
                  disabled={saveChartModal.isSaving}
                  required
                />
                {saveChartModal.errors.name && (
                  <p className="text-red-500 text-xs mt-1">{saveChartModal.errors.name}</p>
                )}
              </div>

              {/* Narrative */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Narrative
                </label>
                <input
                  type="text"
                  value={saveChartModal.chartData.narrative}
                  onChange={(e) => updateSaveChartData({ narrative: e.target.value })}
                  placeholder="Enter a narrative title for this org chart..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={saveChartModal.isSaving}
                />
                <p className="text-gray-500 text-xs mt-1">This will appear as a title above the org chart editor</p>
              </div>

              {/* Account Intel */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Account Intel <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={saveChartModal.chartData.account_intel}
                  onChange={(e) => updateSaveChartData({ account_intel: e.target.value })}
                  placeholder="Enter account intelligence information..."
                  rows={3}
                  className={`w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-vertical ${
                    saveChartModal.errors.account_intel ? 'border-red-500' : 'border-gray-300'
                  }`}
                  disabled={saveChartModal.isSaving}
                  required
                />
                {saveChartModal.errors.account_intel && (
                  <p className="text-red-500 text-xs mt-1">{saveChartModal.errors.account_intel}</p>
                )}
              </div>

              {/* Website */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Company Website <span className="text-red-500">*</span>
                </label>
                <input
                  type="url"
                  value={saveChartModal.chartData.website}
                  onChange={(e) => updateSaveChartData({ website: e.target.value })}
                  placeholder="https://company.com or http://company.com"
                  className={`w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    saveChartModal.errors.website ? 'border-red-500' : 'border-gray-300'
                  }`}
                  disabled={saveChartModal.isSaving}
                  required
                />
                {saveChartModal.errors.website && (
                  <p className="text-red-500 text-xs mt-1">{saveChartModal.errors.website}</p>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={closeSaveChartModal}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 text-sm"
                  disabled={saveChartModal.isSaving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saveChartModal.isSaving}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm flex items-center gap-2"
                >
                  {saveChartModal.isSaving && (
                    <div className="animate-spin h-4 w-4 border-2 border-white rounded-full border-t-transparent"></div>
                  )}
                  {saveChartModal.isSaving ? 'Creating...' : 'Create Chart'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Org Chart Modal */}
      <EditOrgChartModal
        orgChart={editOrgChartModal.orgChart}
        open={editOrgChartModal.isOpen}
        onClose={handleCloseEditModal}
        onSave={handleEditOrgChartSave}
      />

      {/* Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={deleteConfirmationModal.isOpen}
        onClose={handleCloseDeleteModal}
        onConfirm={handleConfirmDelete}
        title="Delete Organization Chart"
        message={`Are you sure you want to delete "${deleteConfirmationModal.orgChart?.name}"? This action cannot be undone.`}
        confirmButtonText="Delete Chart"
        isDeleting={isDeletingOrgChart}
      />

      {/* Save Confirmation Modal */}
      {saveConfirmationModal.isOpen && (
        <BaseModal show={saveConfirmationModal.isOpen} onClose={handleCloseSaveConfirmation}>
          <div className="p-6">
            {/* Header */}
            <div className="flex items-center mb-4">
              <div className="flex-shrink-0 w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-yellow-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
                  />
                </svg>
              </div>
              <div className="ml-4">
                <h3 className="text-lg font-medium text-gray-900">Unsaved Changes</h3>
              </div>
            </div>

            {/* Message */}
            <div className="mb-6">
              <p className="text-sm text-gray-500">
                You have unsaved changes to your org chart. Would you like to save before clearing?
              </p>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3">
              <button
                onClick={handleCloseSaveConfirmation}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Cancel
              </button>
              <button
                onClick={handleDiscardAndClear}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
              >
                Discard Changes
              </button>
              <button
                onClick={handleSaveAndClear}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Save & Clear
              </button>
            </div>
          </div>
        </BaseModal>
      )}
    </div>
  );
};

export default OrgCharts;