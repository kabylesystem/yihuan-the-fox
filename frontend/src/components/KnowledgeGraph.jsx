/**
 * KnowledgeGraph component for Neural-Sync Language Lab.
 *
 * Renders an interactive D3.js force-directed graph visualizing the learner's
 * growing linguistic brain. Nodes represent vocabulary items, sentence
 * structures, and grammar concepts; edges represent relationships between them.
 *
 * Visual encoding:
 *  - Node color: mastery score drives color (red=0 → yellow=0.5 → green=1.0)
 *  - Node size: differs by type (sentence=20, grammar=16, vocab=12)
 *  - Edge style: dash pattern varies by relationship type
 *  - Edge labels: relationship type shown on hover or as small text
 *
 * Interactions:
 *  - Drag nodes to rearrange the graph
 *  - Hover for tooltip with label, mastery, type, and CEFR level
 *  - Scroll wheel to zoom (0.5x to 4x scale)
 *  - Drag background to pan the graph
 *  - Graph auto-centers and re-simulates when data changes
 *
 * Props:
 *  - nodes: Array of { id, label, type, mastery, level, turn_introduced }
 *  - links: Array of { source, target, relationship, turn_introduced }
 *
 * D3 owns the SVG contents via useRef; React only provides the container.
 */

import { useRef, useEffect, useCallback } from 'react';
import * as d3 from 'd3';

// ── Visual constants ─────────────────────────────────────────────────────────

/** Node radius by type. Sentence structures are the largest (most complex). */
const NODE_RADIUS = {
  sentence: 20,
  grammar: 16,
  vocab: 12,
};

/** Dash pattern by relationship type for edge visual differentiation. */
const EDGE_DASH = {
  prerequisite: '8,4',
  semantic: null,        // solid line
  reactivation: '4,4',
  conjugation: '2,6',
};

/** Color for each relationship type (used on edge labels and hover). */
const EDGE_COLOR = {
  prerequisite: '#888',
  semantic: '#6a9fff',
  reactivation: '#ffa644',
  conjugation: '#bb77ff',
};

/**
 * Mastery color scale: red (weak, 0) → yellow (moderate, 0.5) → green (strong, 1.0).
 * Called once; reused across renders.
 */
const masteryColorScale = d3.scaleLinear()
  .domain([0, 0.5, 1])
  .range(['#ff4444', '#ffaa00', '#44ff44'])
  .clamp(true);

/**
 * Glow intensity based on mastery — higher mastery = brighter glow.
 */
function glowRadius(mastery) {
  return 4 + mastery * 8;
}

// ── Component ────────────────────────────────────────────────────────────────

/**
 * Interactive D3.js force-directed Knowledge Graph.
 *
 * @param {Object}   props
 * @param {Array}    props.nodes - Graph node objects from the backend.
 * @param {Array}    props.links - Graph link objects from the backend.
 */
export default function KnowledgeGraph({ nodes, links }) {
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const simulationRef = useRef(null);
  const tooltipRef = useRef(null);

  /**
   * Get the radius for a given node type.
   */
  const getRadius = useCallback((type) => {
    return NODE_RADIUS[type] || NODE_RADIUS.vocab;
  }, []);

  // ── Main D3 render effect ───────────────────────────────────────────────
  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;
    if (!nodes || nodes.length === 0) return;

    // Measure container dimensions
    const container = containerRef.current;
    const { width, height } = container.getBoundingClientRect();
    if (width === 0 || height === 0) return;

    // ── Clean up any existing simulation ──────────────────────────────
    if (simulationRef.current) {
      simulationRef.current.stop();
      simulationRef.current = null;
    }

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    // ── SVG dimensions and defs ──────────────────────────────────────
    svg.attr('width', width).attr('height', height);

    const defs = svg.append('defs');

    // Glow filter for nodes
    const filter = defs.append('filter')
      .attr('id', 'node-glow')
      .attr('x', '-50%')
      .attr('y', '-50%')
      .attr('width', '200%')
      .attr('height', '200%');
    filter.append('feGaussianBlur')
      .attr('stdDeviation', 4)
      .attr('result', 'blur');
    const feMerge = filter.append('feMerge');
    feMerge.append('feMergeNode').attr('in', 'blur');
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    // Arrow marker for directed edges
    defs.append('marker')
      .attr('id', 'arrowhead')
      .attr('viewBox', '0 0 10 10')
      .attr('refX', 20)
      .attr('refY', 5)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M 0 0 L 10 5 L 0 10 z')
      .attr('fill', '#555');

    // ── Tooltip element ──────────────────────────────────────────────
    // Remove any stale tooltips
    d3.select(container).selectAll('.knowledge-graph__tooltip').remove();

    const tooltip = d3.select(container)
      .append('div')
      .attr('class', 'knowledge-graph__tooltip')
      .style('position', 'absolute')
      .style('pointer-events', 'none')
      .style('opacity', 0)
      .style('background', 'rgba(10, 14, 24, 0.95)')
      .style('border', '1px solid rgba(100, 160, 255, 0.3)')
      .style('border-radius', '8px')
      .style('padding', '10px 14px')
      .style('font-size', '13px')
      .style('color', '#e0e4ef')
      .style('box-shadow', '0 4px 20px rgba(0,0,0,0.4)')
      .style('z-index', '10')
      .style('max-width', '220px')
      .style('line-height', '1.5');

    tooltipRef.current = tooltip;

    // ── Deep-clone data to avoid D3 mutating React state ─────────────
    const simNodes = nodes.map((n) => ({ ...n }));
    const simLinks = links.map((l) => ({
      ...l,
      source: l.source,
      target: l.target,
    }));

    // ── Force simulation ─────────────────────────────────────────────
    const simulation = d3.forceSimulation(simNodes)
      .force('link', d3.forceLink(simLinks)
        .id((d) => d.id)
        .distance(100)
      )
      .force('charge', d3.forceManyBody().strength(-250))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide()
        .radius((d) => getRadius(d.type) + 8)
      )
      .force('x', d3.forceX(width / 2).strength(0.05))
      .force('y', d3.forceY(height / 2).strength(0.05));

    simulationRef.current = simulation;

    // ── Main SVG group (for zoom/pan) ────────────────────────────────
    const g = svg.append('g');

    // ── Zoom and pan behavior ────────────────────────────────────────
    const zoom = d3.zoom()
      .scaleExtent([0.5, 4])  // Allow zoom from 0.5x to 4x
      .filter((event) => {
        // Allow zoom/pan on wheel or when not dragging a node
        // This prevents zoom from interfering with node drag
        return event.type === 'wheel' || !event.target.closest('.knowledge-graph__node');
      })
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    svg.call(zoom);

    // ── Render edges ─────────────────────────────────────────────────
    const linkGroup = g.append('g').attr('class', 'knowledge-graph__links');

    const link = linkGroup.selectAll('line')
      .data(simLinks)
      .join('line')
      .attr('stroke', (d) => EDGE_COLOR[d.relationship] || '#555')
      .attr('stroke-width', 1.5)
      .attr('stroke-opacity', 0.6)
      .attr('stroke-dasharray', (d) => EDGE_DASH[d.relationship] || null)
      .attr('marker-end', 'url(#arrowhead)');

    // Edge relationship labels (positioned at midpoint)
    const linkLabel = linkGroup.selectAll('text')
      .data(simLinks)
      .join('text')
      .attr('class', 'knowledge-graph__link-label')
      .attr('text-anchor', 'middle')
      .attr('fill', (d) => EDGE_COLOR[d.relationship] || '#888')
      .attr('font-size', '9px')
      .attr('opacity', 0.7)
      .attr('dy', -6)
      .text((d) => d.relationship);

    // ── Render nodes ─────────────────────────────────────────────────
    const nodeGroup = g.append('g').attr('class', 'knowledge-graph__nodes');

    const node = nodeGroup.selectAll('g')
      .data(simNodes)
      .join('g')
      .attr('class', 'knowledge-graph__node');

    // Glow circle (behind the main circle)
    node.append('circle')
      .attr('class', 'knowledge-graph__node-glow')
      .attr('r', (d) => getRadius(d.type) + glowRadius(d.mastery))
      .attr('fill', (d) => masteryColorScale(d.mastery))
      .attr('opacity', (d) => 0.15 + d.mastery * 0.15);

    // Main node circle
    node.append('circle')
      .attr('class', 'knowledge-graph__node-circle')
      .attr('r', (d) => getRadius(d.type))
      .attr('fill', (d) => masteryColorScale(d.mastery))
      .attr('stroke', '#1a1e2e')
      .attr('stroke-width', 2)
      .style('filter', 'url(#node-glow)')
      .style('cursor', 'grab');

    // Node label text
    node.append('text')
      .attr('class', 'knowledge-graph__node-label')
      .attr('text-anchor', 'middle')
      .attr('dy', (d) => getRadius(d.type) + 14)
      .attr('fill', '#c0c8e0')
      .attr('font-size', '11px')
      .attr('font-weight', 500)
      .text((d) => d.label);

    // ── Node interactions: hover + drag ──────────────────────────────

    // Hover tooltip
    /**
     * Safely escape HTML entities to prevent XSS from backend-sourced strings.
     */
    function escapeHtml(str) {
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    node
      .on('mouseenter', (event, d) => {
        const masteryPct = Math.round(d.mastery * 100);
        const color = masteryColorScale(d.mastery);
        const safeLabel = escapeHtml(d.label);
        const safeType = escapeHtml(d.type);
        const safeLevel = escapeHtml(d.level);
        tooltip
          .html(`
            <div style="margin-bottom:4px">
              <strong style="color:${color};font-size:14px">${safeLabel}</strong>
            </div>
            <div>Type: <span style="color:#6a9fff">${safeType}</span></div>
            <div>Mastery: <span style="color:${color}">${masteryPct}%</span></div>
            <div>Level: <span style="color:#bb77ff">${safeLevel}</span></div>
          `)
          .style('opacity', 1);

        // Highlight the hovered node
        d3.select(event.currentTarget).select('.knowledge-graph__node-circle')
          .attr('stroke', '#fff')
          .attr('stroke-width', 3);

        // Highlight connected edges
        link
          .attr('stroke-opacity', (l) =>
            (l.source.id === d.id || l.target.id === d.id) ? 1 : 0.15
          )
          .attr('stroke-width', (l) =>
            (l.source.id === d.id || l.target.id === d.id) ? 2.5 : 1.5
          );
      })
      .on('mousemove', (event) => {
        const rect = container.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        tooltip
          .style('left', `${x + 16}px`)
          .style('top', `${y - 10}px`);
      })
      .on('mouseleave', (event) => {
        tooltip.style('opacity', 0);

        // Reset node highlight
        d3.select(event.currentTarget).select('.knowledge-graph__node-circle')
          .attr('stroke', '#1a1e2e')
          .attr('stroke-width', 2);

        // Reset edge highlight
        link
          .attr('stroke-opacity', 0.6)
          .attr('stroke-width', 1.5);
      });

    // Drag behavior
    const drag = d3.drag()
      .on('start', (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
        if (event.sourceEvent?.target) {
          d3.select(event.sourceEvent.target).style('cursor', 'grabbing');
        }
      })
      .on('drag', (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
        if (event.sourceEvent?.target) {
          d3.select(event.sourceEvent.target).style('cursor', 'grab');
        }
      });

    node.call(drag);

    // ── Tick handler: update positions each frame ────────────────────
    simulation.on('tick', () => {
      // Keep nodes within bounds
      simNodes.forEach((d) => {
        const r = getRadius(d.type) + 10;
        d.x = Math.max(r, Math.min(width - r, d.x));
        d.y = Math.max(r, Math.min(height - r, d.y));
      });

      link
        .attr('x1', (d) => d.source.x)
        .attr('y1', (d) => d.source.y)
        .attr('x2', (d) => d.target.x)
        .attr('y2', (d) => d.target.y);

      linkLabel
        .attr('x', (d) => (d.source.x + d.target.x) / 2)
        .attr('y', (d) => (d.source.y + d.target.y) / 2);

      node.attr('transform', (d) => `translate(${d.x},${d.y})`);
    });

    // ── Cleanup on unmount or data change ────────────────────────────
    return () => {
      simulation.stop();
      simulationRef.current = null;
      if (tooltipRef.current) {
        tooltipRef.current.remove();
        tooltipRef.current = null;
      }
    };
  }, [nodes, links, getRadius]);

  // ── Render ─────────────────────────────────────────────────────────────

  const hasData = nodes && nodes.length > 0;

  return (
    <div className="knowledge-graph" ref={containerRef}>
      <div className="knowledge-graph__header">
        <h2 className="knowledge-graph__title">Knowledge Graph</h2>
        {hasData && (
          <span className="knowledge-graph__stats">
            {nodes.length} concepts · {links.length} connections
          </span>
        )}
      </div>

      <div className="knowledge-graph__canvas">
        {hasData ? (
          <svg
            ref={svgRef}
            className="knowledge-graph__svg"
            style={{ width: '100%', height: '100%' }}
          />
        ) : (
          <div className="knowledge-graph__empty">
            <div className="knowledge-graph__empty-icon">🧠</div>
            <p className="knowledge-graph__empty-text">
              Start a conversation to build your knowledge graph!
            </p>
            <p className="knowledge-graph__empty-hint">
              Nodes will appear as you learn new vocabulary and sentence structures.
            </p>
          </div>
        )}
      </div>

      {/* Legend */}
      {hasData && (
        <div className="knowledge-graph__legend">
          <div className="knowledge-graph__legend-section">
            <span className="knowledge-graph__legend-title">Mastery</span>
            <div className="knowledge-graph__legend-items">
              <span className="knowledge-graph__legend-item">
                <span className="knowledge-graph__legend-dot" style={{ background: '#ff4444' }} />
                Low
              </span>
              <span className="knowledge-graph__legend-item">
                <span className="knowledge-graph__legend-dot" style={{ background: '#ffaa00' }} />
                Mid
              </span>
              <span className="knowledge-graph__legend-item">
                <span className="knowledge-graph__legend-dot" style={{ background: '#44ff44' }} />
                High
              </span>
            </div>
          </div>
          <div className="knowledge-graph__legend-section">
            <span className="knowledge-graph__legend-title">Type</span>
            <div className="knowledge-graph__legend-items">
              <span className="knowledge-graph__legend-item">
                <span className="knowledge-graph__legend-circle knowledge-graph__legend-circle--sentence" />
                Sentence
              </span>
              <span className="knowledge-graph__legend-item">
                <span className="knowledge-graph__legend-circle knowledge-graph__legend-circle--grammar" />
                Grammar
              </span>
              <span className="knowledge-graph__legend-item">
                <span className="knowledge-graph__legend-circle knowledge-graph__legend-circle--vocab" />
                Vocab
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
