/**
 * Custom hook for fetching and managing Knowledge Graph data.
 *
 * Responsibilities:
 *  - Fetches graph nodes and links from the REST API on mount
 *  - Re-fetches whenever the current turn changes (graph grows progressively)
 *  - Exposes loading / error states for the UI
 *  - Provides a manual refetch() for on-demand refreshes (e.g., after reset)
 *
 * Data shapes (from backend):
 *   nodes -> [{ id, label, type, mastery, level, turn_introduced }]
 *   links -> [{ source, target, relationship, turn_introduced }]
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchGraphData } from '../services/api';

/**
 * Custom hook for managing Knowledge Graph state.
 *
 * @param {number} currentTurn - The current conversation turn number.
 *   The graph is re-fetched each time this value changes so newly
 *   introduced nodes and links appear automatically.
 *
 * @returns {{
 *   nodes: Array,
 *   links: Array,
 *   isLoading: boolean,
 *   error: string | null,
 *   refetch: () => Promise<void>,
 * }}
 */
export function useKnowledgeGraph(currentTurn) {
  const [nodes, setNodes] = useState([]);
  const [links, setLinks] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Track the latest request so we can ignore stale responses.
  const requestIdRef = useRef(0);

  /**
   * Fetch graph nodes and links from the backend.
   *
   * Uses a request counter to prevent race conditions — if a newer
   * fetch fires before an older one completes, the stale result is
   * silently discarded.
   */
  const refetch = useCallback(async () => {
    const thisRequest = ++requestIdRef.current;
    setIsLoading(true);
    setError(null);

    try {
      const { nodes: fetchedNodes, links: fetchedLinks } = await fetchGraphData();

      // Only apply if this is still the most recent request
      if (thisRequest === requestIdRef.current) {
        setNodes(fetchedNodes);
        setLinks(fetchedLinks);
      }
    } catch (err) {
      if (thisRequest === requestIdRef.current) {
        setError(err.message || 'Failed to fetch graph data');
      }
    } finally {
      if (thisRequest === requestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  // ── Auto-fetch when the turn changes ───────────────────────────────
  // The backend filters nodes/links by `turn_introduced <= current_turn`,
  // so re-fetching after each turn progressively reveals the graph.
  useEffect(() => {
    refetch();
  }, [currentTurn, refetch]);

  return {
    nodes,
    links,
    isLoading,
    error,
    refetch,
  };
}
