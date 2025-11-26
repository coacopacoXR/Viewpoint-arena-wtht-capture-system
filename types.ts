import { Vector3 } from 'three';
import React from 'react';

// Augment React's JSX namespace (for React 18+ / TS 5+)
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      [elemName: string]: any;
    }
  }
}

// Augment Global JSX namespace (for older setups or specific TS configs)
declare global {
  namespace JSX {
    interface IntrinsicElements {
      [elemName: string]: any;
    }
  }
}

export enum ViewMode {
  FREE = 'FREE',
  FOLLOW_PRESENTER = 'FOLLOW_PRESENTER',
  POV_AGENT = 'POV_AGENT',
  OVERHEAD = 'OVERHEAD',
  HEATMAP = 'HEATMAP',
  AI_GUIDED = 'AI_GUIDED',
  SPLIT_SCREEN = 'SPLIT_SCREEN'
}

export enum RepresentationMode {
  MINIMAL = 'MINIMAL',
  FULL = 'FULL'
}

export enum AgentStyle {
  BOX = 'BOX',
  CAPSULE = 'CAPSULE',
  ROBOT = 'ROBOT'
}

export interface PointOfInterest {
  id: string;
  position: Vector3;
  label: string;
  type: 'KNOB' | 'SCREEN' | 'KEY' | 'GENERAL';
}

export type AgentRole = 'PRESENTER' | 'REVIEWER' | 'OBSERVER';

export type AgentBehaviorState = 'IDLE' | 'MOVING' | 'INSPECTING' | 'DISCUSSING' | 'FOLLOWING';

export interface AgentState {
  id: string;
  name: string;
  role: AgentRole;
  color: string;
  behavior: AgentBehaviorState;
  currentPoiId: string | null; // The POI they are interested in
  attentionLevel: number; // 0-1, simulates cognitive load/focus
}

export interface SimulationFrame {
  time: number;
  isPlaying: boolean;
}

export interface ChatMessage {
  id: string;
  agentId: string;
  text: string;
  timestamp: number;
}

export type InsightType = 'RISK' | 'RATIONALE' | 'ACTION';

export interface InsightDetails {
  priority: 'Critical' | 'High' | 'Medium' | 'Low';
  status: 'Open' | 'In Review' | 'Approved' | 'Rejected';
  assignee?: string;
  dueDate?: string;
  componentReference?: string; // The name of the component from the tree
  
  // Risk Specific
  impact?: string;
  mitigationStrategy?: string;
  
  // Rationale Specific
  designDriver?: string;
  alternativesConsidered?: string;
  tradeoffAnalysis?: string;
  
  // Action Specific
  department?: string;
}

export interface InsightCard {
  id: string;
  type: InsightType;
  agentId: string;
  title: string;
  description: string;
  timestamp: number;
  relatedPoiId?: string;
  sourceMessageIds?: string[]; // Array of IDs linking back to the conversation cluster
  details: InsightDetails;
  
  // NEW: Compliance & Historical Data
  affectedRequirementIds?: string[];
  kbRecommendations?: string[];
}

// --- SCENE GRAPH TYPES ---

export interface SceneNode {
  id: string;
  name: string;
  type: 'GROUP' | 'MESH' | 'PART';
  children?: SceneNode[];
}

export interface ObjectState {
  id: string;
  visible: boolean;
  selected: boolean;
  expanded?: boolean;
}

// --- DOCUMENTATION TYPES ---

export interface Requirement {
  id: string;
  code: string;
  description: string;
  category: 'MECHANICAL' | 'ELECTRICAL' | 'ERGONOMIC' | 'SAFETY';
  status: 'MET' | 'PENDING' | 'AT_RISK';
}

export interface KBEntry {
    id: string;
    category: InsightType;
    triggerKeyword: string;
    recommendation: string;
}