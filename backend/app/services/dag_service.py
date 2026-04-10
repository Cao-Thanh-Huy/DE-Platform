"""
DE Platform — DAG Service
Core engine: Builder + Validator + CTE SQL Compiler

Flow:
  UI JSON (nodes + edges)
    → DAGBuilder.build()      → normalized DAG
    → DAGValidator.validate() → errors list
    → CTECompiler.compile()   → Trino CTE SQL string
"""
from __future__ import annotations

import re
from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import Any

# ─────────────────────────────────────────────────────────────────────────────
# Data structures
# ─────────────────────────────────────────────────────────────────────────────

VALID_NODE_TYPES = {"source", "filter", "select", "join", "aggregate", "union", "sink"}


@dataclass
class DAGNode:
    id: str
    type: str
    label: str
    config: dict[str, Any] = field(default_factory=dict)


@dataclass
class DAGEdge:
    source: str       # node id
    target: str       # node id
    source_handle: str | None = None   # "left" | "right" for join
    target_handle: str | None = None


@dataclass
class NormalizedDAG:
    nodes: dict[str, DAGNode]          # id → DAGNode
    edges: list[DAGEdge]
    adj: dict[str, list[str]]          # id → [downstream ids]
    rev: dict[str, list[str]]          # id → [upstream ids]
    topo_order: list[str]              # topological sort result


@dataclass
class ValidationError:
    code: str
    message: str
    node_id: str | None = None


@dataclass
class CompileResult:
    sql: str
    errors: list[ValidationError]
    warnings: list[str]


# ─────────────────────────────────────────────────────────────────────────────
# DAG Builder
# ─────────────────────────────────────────────────────────────────────────────

class DAGBuilder:
    """
    Converts raw UI JSON (React Flow format) → NormalizedDAG.

    Input format:
    {
      "nodes": [{"id": "n1", "type": "source", "data": {"label": "...", ...}}],
      "edges": [{"source": "n1", "target": "n2", "sourceHandle": "left"}]
    }
    """

    def build(self, definition_json: dict) -> NormalizedDAG:
        raw_nodes: list[dict] = definition_json.get("nodes", [])
        raw_edges: list[dict] = definition_json.get("edges", [])

        # Build node map
        nodes: dict[str, DAGNode] = {}
        for rn in raw_nodes:
            node_id = rn["id"]
            data = rn.get("data", {})
            nodes[node_id] = DAGNode(
                id=node_id,
                type=rn.get("type", "unknown"),
                label=data.get("label", node_id),
                config=data,
            )

        # Build edge list
        edges: list[DAGEdge] = []
        adj: dict[str, list[str]] = defaultdict(list)
        rev: dict[str, list[str]] = defaultdict(list)

        for re_ in raw_edges:
            src = re_.get("source")
            tgt = re_.get("target")
            if src and tgt:
                edge = DAGEdge(
                    source=src,
                    target=tgt,
                    source_handle=re_.get("sourceHandle"),
                    target_handle=re_.get("targetHandle"),
                )
                edges.append(edge)
                adj[src].append(tgt)
                rev[tgt].append(src)

        # Topological sort (Kahn's algorithm)
        topo = self._topological_sort(list(nodes.keys()), adj)

        return NormalizedDAG(
            nodes=nodes,
            edges=edges,
            adj=dict(adj),
            rev=dict(rev),
            topo_order=topo,
        )

    def _topological_sort(self, node_ids: list[str], adj: dict) -> list[str]:
        """Kahn's BFS — returns topo order; empty if cycle detected."""
        in_degree: dict[str, int] = {n: 0 for n in node_ids}
        for src, targets in adj.items():
            for tgt in targets:
                in_degree[tgt] = in_degree.get(tgt, 0) + 1

        queue = deque([n for n in node_ids if in_degree.get(n, 0) == 0])
        order = []
        while queue:
            node = queue.popleft()
            order.append(node)
            for tgt in adj.get(node, []):
                in_degree[tgt] -= 1
                if in_degree[tgt] == 0:
                    queue.append(tgt)

        return order  # len < len(node_ids) → cycle exists


# ─────────────────────────────────────────────────────────────────────────────
# DAG Validator
# ─────────────────────────────────────────────────────────────────────────────

class DAGValidator:
    """
    Validates a NormalizedDAG before compilation.
    Returns list of ValidationError (empty = valid).
    """

    def validate(
        self,
        dag: NormalizedDAG,
        schema_map: dict[str, list[str]] | None = None,
    ) -> list[ValidationError]:
        """
        schema_map: {node_id: [column_names]} fetched from Trino DESCRIBE TABLE
                    for source nodes. Pass None to skip column validation.
        """
        errors: list[ValidationError] = []

        errors += self._check_cycle(dag)
        errors += self._check_min_nodes(dag)
        errors += self._check_node_types(dag)
        errors += self._check_node_config(dag)
        errors += self._check_disconnected(dag)
        errors += self._check_join_inputs(dag)
        if schema_map:
            errors += self._check_column_refs(dag, schema_map)

        return errors

    def _check_cycle(self, dag: NormalizedDAG) -> list[ValidationError]:
        if len(dag.topo_order) != len(dag.nodes):
            return [ValidationError(
                code="CYCLE_DETECTED",
                message="Pipeline có chu trình (cycle). DAG phải là Directed Acyclic Graph.",
            )]
        return []

    def _check_min_nodes(self, dag: NormalizedDAG) -> list[ValidationError]:
        errors = []
        sources = [n for n in dag.nodes.values() if n.type == "source"]
        sinks = [n for n in dag.nodes.values() if n.type == "sink"]
        if not sources:
            errors.append(ValidationError(code="NO_SOURCE", message="Pipeline phải có ít nhất 1 node Source."))
        if not sinks:
            errors.append(ValidationError(code="NO_SINK", message="Pipeline phải có ít nhất 1 node Sink."))
        return errors

    def _check_node_types(self, dag: NormalizedDAG) -> list[ValidationError]:
        errors = []
        for node in dag.nodes.values():
            if node.type not in VALID_NODE_TYPES:
                errors.append(ValidationError(
                    code="INVALID_NODE_TYPE",
                    message=f"Node type không hợp lệ: '{node.type}'",
                    node_id=node.id,
                ))
        return errors

    def _check_node_config(self, dag: NormalizedDAG) -> list[ValidationError]:
        errors = []
        for node in dag.nodes.values():
            cfg = node.config
            if node.type == "source":
                for f in ("schema", "table"):
                    if not cfg.get(f):
                        errors.append(ValidationError(
                            code="MISSING_CONFIG",
                            message=f"Source node thiếu field '{f}'",
                            node_id=node.id,
                        ))
            elif node.type == "filter":
                if not cfg.get("condition"):
                    errors.append(ValidationError(
                        code="MISSING_CONFIG",
                        message="Filter node thiếu điều kiện WHERE",
                        node_id=node.id,
                    ))
            elif node.type == "select":
                if not cfg.get("columns"):
                    errors.append(ValidationError(
                        code="MISSING_CONFIG",
                        message="Select node thiếu danh sách columns",
                        node_id=node.id,
                    ))
            elif node.type == "aggregate":
                if not cfg.get("aggregations"):
                    errors.append(ValidationError(
                        code="MISSING_CONFIG",
                        message="Aggregate node thiếu aggregation expressions",
                        node_id=node.id,
                    ))
            elif node.type == "join":
                for f in ("join_type", "on_condition"):
                    if not cfg.get(f):
                        errors.append(ValidationError(
                            code="MISSING_CONFIG",
                            message=f"Join node thiếu field '{f}'",
                            node_id=node.id,
                        ))
            elif node.type == "sink":
                for f in ("schema", "table"):
                    if not cfg.get(f):
                        errors.append(ValidationError(
                            code="MISSING_CONFIG",
                            message=f"Sink node thiếu field '{f}'",
                            node_id=node.id,
                        ))
        return errors

    def _check_disconnected(self, dag: NormalizedDAG) -> list[ValidationError]:
        if len(dag.nodes) <= 1:
            return []
        errors = []
        for node_id, node in dag.nodes.items():
            has_in = node_id in dag.rev and dag.rev[node_id]
            has_out = node_id in dag.adj and dag.adj[node_id]
            if node.type not in ("source", "sink") and not has_in and not has_out:
                errors.append(ValidationError(
                    code="DISCONNECTED_NODE",
                    message=f"Node '{node.label}' không được kết nối",
                    node_id=node_id,
                ))
        return []

    def _check_join_inputs(self, dag: NormalizedDAG) -> list[ValidationError]:
        errors = []
        for node in dag.nodes.values():
            if node.type == "join":
                upstream = dag.rev.get(node.id, [])
                if len(upstream) < 2:
                    errors.append(ValidationError(
                        code="JOIN_MISSING_INPUT",
                        message=f"Join node '{node.label}' cần đúng 2 input (Left + Right)",
                        node_id=node.id,
                    ))
        return errors

    def _check_column_refs(
        self,
        dag: NormalizedDAG,
        schema_map: dict[str, list[str]],
    ) -> list[ValidationError]:
        """Check filter/join conditions only reference existing columns from source."""
        errors = []
        for node_id, columns in schema_map.items():
            node = dag.nodes.get(node_id)
            if not node:
                continue
            # For filters: scan condition for column names
            if node.type == "filter":
                condition = node.config.get("condition", "")
                # Simple heuristic: warn if no known column found in condition
                # Full check would require SQL parser — keep lightweight here
                pass  # Reserved for advanced validation
        return errors


# ─────────────────────────────────────────────────────────────────────────────
# CTE SQL Compiler
# ─────────────────────────────────────────────────────────────────────────────

class CTECompiler:
    """
    Compiles a validated NormalizedDAG → single Trino CTE SQL string.

    Strategy:
      1. Topological sort → process nodes in dependency order
      2. Each non-sink node = 1 CTE
      3. Sink node = final INSERT ... MERGE or CREATE OR REPLACE TABLE
      4. Default write mode: MERGE (upsert)

    CTE naming: {node_id}_cte
    """

    def compile(self, dag: NormalizedDAG) -> str:
        ctes: list[tuple[str, str]] = []   # (cte_name, sql_body)
        last_cte: str | None = None
        sink_node: DAGNode | None = None

        for node_id in dag.topo_order:
            node = dag.nodes[node_id]
            if node.type == "sink":
                sink_node = node
                continue

            cte_name = self._cte_name(node_id)
            cte_body = self._compile_node(node, dag, cte_name)
            if cte_body:
                ctes.append((cte_name, cte_body))
                last_cte = cte_name

        if not ctes:
            return "-- Empty pipeline"

        # Build WITH clause
        cte_parts = []
        for name, body in ctes:
            cte_parts.append(f"  {name} AS (\n{self._indent(body, 4)}\n  )")

        with_clause = "WITH\n" + ",\n".join(cte_parts) if cte_parts else ""

        # Build final statement (sink)
        final_stmt = self._compile_sink(sink_node, last_cte, dag, with_clause)

        return final_stmt

    def _cte_name(self, node_id: str) -> str:
        safe = re.sub(r"[^a-zA-Z0-9_]", "_", node_id)
        return f"cte_{safe}"

    def _get_upstream_cte(self, node: DAGNode, dag: NormalizedDAG) -> str | None:
        """Get the CTE name of the (first) upstream node."""
        upstream_ids = dag.rev.get(node.id, [])
        if not upstream_ids:
            return None
        return self._cte_name(upstream_ids[0])

    def _get_join_upstream(self, node: DAGNode, dag: NormalizedDAG) -> tuple[str | None, str | None]:
        """For join: return (left_cte, right_cte) based on edge sourceHandle."""
        all_edges = [e for e in dag.edges if e.target == node.id]
        left_cte = right_cte = None
        for edge in all_edges:
            cte = self._cte_name(edge.source)
            handle = (edge.source_handle or "").lower()
            if "right" in handle:
                right_cte = cte
            else:
                left_cte = cte  # default: left
        # Fallback if handles not set
        if not left_cte and not right_cte:
            upstream_ids = dag.rev.get(node.id, [])
            if len(upstream_ids) >= 2:
                left_cte = self._cte_name(upstream_ids[0])
                right_cte = self._cte_name(upstream_ids[1])
        return left_cte, right_cte

    def _compile_node(self, node: DAGNode, dag: NormalizedDAG, cte_name: str) -> str:
        if node.type == "source":
            return self._compile_source(node)
        elif node.type == "filter":
            return self._compile_filter(node, dag)
        elif node.type == "select":
            return self._compile_select(node, dag)
        elif node.type == "join":
            return self._compile_join(node, dag)
        elif node.type == "aggregate":
            return self._compile_aggregate(node, dag)
        elif node.type == "union":
            return self._compile_union(node, dag)
        return f"SELECT 1 -- unsupported node type: {node.type}"

    def _compile_source(self, node: DAGNode) -> str:
        cfg = node.config
        catalog = cfg.get("catalog", "iceberg")
        schema = cfg.get("schema", "bronze")
        table = cfg.get("table", "")
        # Column pruning: if selected_columns set, use them; else *
        columns = cfg.get("selected_columns") or ["*"]
        col_str = ", ".join(columns)
        return f"SELECT {col_str}\nFROM {catalog}.{schema}.{table}"

    def _compile_filter(self, node: DAGNode, dag: NormalizedDAG) -> str:
        upstream = self._get_upstream_cte(node, dag)
        condition = node.config.get("condition", "TRUE")
        from_clause = upstream or "/* missing upstream */"
        return f"SELECT *\nFROM {from_clause}\nWHERE {condition}"

    def _compile_select(self, node: DAGNode, dag: NormalizedDAG) -> str:
        upstream = self._get_upstream_cte(node, dag)
        columns: list[str] = node.config.get("columns", ["*"])
        col_str = ", ".join(columns)
        from_clause = upstream or "/* missing upstream */"
        return f"SELECT {col_str}\nFROM {from_clause}"

    def _compile_join(self, node: DAGNode, dag: NormalizedDAG) -> str:
        left_cte, right_cte = self._get_join_upstream(node, dag)
        cfg = node.config
        join_type = cfg.get("join_type", "INNER").upper()
        on_condition = cfg.get("on_condition", "TRUE")
        left_alias = cfg.get("left_alias", "l")
        right_alias = cfg.get("right_alias", "r")
        select_cols = cfg.get("select_columns", ["*"])
        col_str = ", ".join(select_cols)
        return (
            f"SELECT {col_str}\n"
            f"FROM {left_cte or '/* missing left */'} {left_alias}\n"
            f"{join_type} JOIN {right_cte or '/* missing right */'} {right_alias}\n"
            f"  ON {on_condition}"
        )

    def _compile_aggregate(self, node: DAGNode, dag: NormalizedDAG) -> str:
        upstream = self._get_upstream_cte(node, dag)
        cfg = node.config
        group_by: list[str] = cfg.get("group_by", [])
        # aggregations: [{"alias": "total_amount", "expr": "SUM(amount)"}]
        aggregations: list[dict] = cfg.get("aggregations", [])
        from_clause = upstream or "/* missing upstream */"

        agg_exprs = []
        for agg in aggregations:
            expr = agg.get("expr", "COUNT(*)")
            alias = agg.get("alias")
            agg_exprs.append(f"{expr} AS {alias}" if alias else expr)

        select_parts = group_by + agg_exprs
        select_str = ", ".join(select_parts) if select_parts else "*"
        sql = f"SELECT {select_str}\nFROM {from_clause}"
        if group_by:
            sql += f"\nGROUP BY {', '.join(group_by)}"
        return sql

    def _compile_union(self, node: DAGNode, dag: NormalizedDAG) -> str:
        upstream_ids = dag.rev.get(node.id, [])
        union_all = node.config.get("union_all", True)
        union_kw = "UNION ALL" if union_all else "UNION"
        parts = [f"SELECT * FROM {self._cte_name(uid)}" for uid in upstream_ids]
        return f"\n{union_kw}\n".join(parts)

    def _compile_sink(
        self,
        sink_node: DAGNode | None,
        last_cte: str | None,
        dag: NormalizedDAG,
        with_clause: str = "",
    ) -> str:
        """
        Default write mode: MERGE (upsert).
        Falls back to INSERT or CREATE OR REPLACE TABLE based on config.
        """
        if not sink_node or not last_cte:
            return f"{with_clause}\nSELECT * FROM {last_cte}" if with_clause else f"SELECT * FROM {last_cte}"

        cfg = sink_node.config
        catalog = cfg.get("catalog", "iceberg")
        schema = cfg.get("schema", "silver")
        table = cfg.get("table", "output")
        write_mode = cfg.get("write_mode", "merge").lower()
        target = f"{catalog}.{schema}.{table}"

        column_mapping = cfg.get("column_mapping", {})
        mapped_select = "*"
        if column_mapping:
            mapping_exprs = []
            for tgt_col, src_col in column_mapping.items():
                if src_col:
                    mapping_exprs.append(f"{src_col} AS {tgt_col}")
                else:
                    mapping_exprs.append(f"NULL AS {tgt_col}")
            mapped_select = ", ".join(mapping_exprs)

        source_query_inner = f"SELECT {mapped_select} FROM {last_cte}"
        source_query = f"{with_clause}\n{source_query_inner}" if with_clause else source_query_inner

        if write_mode == "merge":
            merge_keys: list[str] = cfg.get("merge_keys", [])
            if not merge_keys:
                # Fallback: INSERT overwrite if no merge keys defined
                return (
                    f"INSERT INTO {target}\n"
                    f"{source_query}"
                )
            # Build MERGE statement
            key_conditions = " AND ".join(
                [f"t.{k} = s.{k}" for k in merge_keys]
            )

            if column_mapping:
                target_cols = list(column_mapping.keys())
                # Update only non-key columns
                update_cols = [c for c in target_cols if c not in merge_keys]
                update_set = ", ".join([f"{c} = s.{c}" for c in update_cols])
                
                insert_cols = ", ".join(target_cols)
                insert_values = ", ".join([f"s.{c}" for c in target_cols])
                
                matched_clause = f"WHEN MATCHED THEN UPDATE SET {update_set}\n" if update_set else ""
                not_matched_clause = f"WHEN NOT MATCHED THEN INSERT ({insert_cols}) VALUES ({insert_values})"
            else:
                # Fallback if no mapping exists (will fail in Trino syntax if expanded to *, Trino requires names)
                matched_clause = "WHEN MATCHED THEN UPDATE SET /* REQUIRES COLUMN_MAPPING */\n"
                not_matched_clause = "WHEN NOT MATCHED THEN INSERT /* REQUIRES COLUMN_MAPPING */"

            return (
                f"MERGE INTO {target} AS t\n"
                f"USING (\n{self._indent(source_query, 2)}\n) AS s\n"
                f"  ON ({key_conditions})\n"
                f"{matched_clause}"
                f"{not_matched_clause}"
            ).strip()
        elif write_mode == "overwrite":
            return (
                f"CREATE OR REPLACE TABLE {target} AS\n"
                f"{source_query}"
            )
        elif write_mode == "append":
            return (
                f"INSERT INTO {target}\n"
                f"{source_query}"
            )
        else:
            return f"SELECT * FROM {last_cte} -- unknown write_mode: {write_mode}"

    def _indent(self, text: str, spaces: int) -> str:
        pad = " " * spaces
        return "\n".join(pad + line for line in text.splitlines())


# ─────────────────────────────────────────────────────────────────────────────
# Public façade
# ─────────────────────────────────────────────────────────────────────────────

class DAGService:
    """Single entry point for all DAG operations."""

    def __init__(self):
        self.builder = DAGBuilder()
        self.validator = DAGValidator()
        self.compiler = CTECompiler()

    def build_and_validate(
        self,
        definition_json: dict,
        schema_map: dict[str, list[str]] | None = None,
    ) -> tuple[NormalizedDAG, list[ValidationError]]:
        dag = self.builder.build(definition_json)
        errors = self.validator.validate(dag, schema_map)
        return dag, errors

    def compile(self, dag: NormalizedDAG) -> str:
        return self.compiler.compile(dag)

    def build_validate_compile(
        self,
        definition_json: dict,
        schema_map: dict[str, list[str]] | None = None,
    ) -> CompileResult:
        dag, errors = self.build_and_validate(definition_json, schema_map)
        if errors:
            return CompileResult(sql="", errors=errors, warnings=[])
        sql = self.compile(dag)
        return CompileResult(sql=sql, errors=[], warnings=[])
