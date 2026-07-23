import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { getSnapshot, listConnections, runAction } from "../../lib/api";
import { ConnectionSelect, Field, FormBody, Label, Modal, ResultBlock, } from "./Modal";
export function NewSubscriptionModal({ onClose }) {
    const qc = useQueryClient();
    const conns = useQuery({ queryKey: ["connections"], queryFn: listConnections });
    const connections = useMemo(() => conns.data ?? [], [conns.data]);
    const snapQueries = useQueries({
        queries: connections.map((c) => ({
            queryKey: ["snapshot", c.id],
            queryFn: () => getSnapshot(c.id),
            refetchInterval: 10_000,
            retry: false,
        })),
    });
    const snapshots = useMemo(() => {
        const m = {};
        connections.forEach((c, i) => {
            m[c.id] = snapQueries[i]?.data;
        });
        return m;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [connections, snapQueries.map((q) => q.dataUpdatedAt).join(",")]);
    const [subscriberId, setSubscriberId] = useState("");
    const [publisherId, setPublisherId] = useState("");
    const [name, setName] = useState("");
    const [picked, setPicked] = useState(new Set());
    const [enabled, setEnabled] = useState(true);
    const [createSlot, setCreateSlot] = useState(true);
    const [copyData, setCopyData] = useState(true);
    const [slotName, setSlotName] = useState("");
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    useEffect(() => {
        if (!subscriberId && connections.length > 0)
            setSubscriberId(connections[0].id);
        if (!publisherId && connections.length > 0) {
            setPublisherId(connections[1]?.id ?? connections[0].id);
        }
    }, [connections, subscriberId, publisherId]);
    const pubOptions = useMemo(() => snapshots[publisherId]?.publications.map((p) => p.name) ?? [], [snapshots, publisherId]);
    const togglePub = (n) => {
        const next = new Set(picked);
        if (next.has(n))
            next.delete(n);
        else
            next.add(n);
        setPicked(next);
    };
    const m = useMutation({
        mutationFn: () => {
            const action = {
                kind: "create_subscription",
                name,
                publisher_connection_id: publisherId,
                publications: [...picked],
                enabled,
                create_slot: createSlot,
                copy_data: copyData,
                slot_name: slotName.trim() ? slotName.trim() : null,
            };
            return runAction(subscriberId, action);
        },
        onSuccess: (res) => {
            setResult(res);
            if (res.ok) {
                qc.invalidateQueries({ queryKey: ["snapshot", subscriberId] });
                qc.invalidateQueries({ queryKey: ["snapshot", publisherId] });
            }
        },
        onError: (e) => setError(e.message),
    });
    const sameSrcDst = publisherId === subscriberId;
    const canSubmit = !!subscriberId && !!publisherId && !!name && picked.size > 0 && !m.isPending;
    return (_jsx(Modal, { title: "New subscription", onClose: onClose, children: _jsxs(FormBody, { children: [_jsx(Label, { children: "Subscriber database (where the SUBSCRIPTION is created)" }), _jsx(ConnectionSelect, { connections: connections, value: subscriberId, onChange: setSubscriberId }), _jsx(Label, { children: "Publisher database (CONNECTION target)" }), _jsx(ConnectionSelect, { connections: connections, value: publisherId, onChange: (id) => {
                        setPublisherId(id);
                        setPicked(new Set());
                    } }), sameSrcDst ? (_jsx("div", { className: "lag-warn", style: { fontSize: 11 }, children: "Subscriber and publisher are the same database. That works for testing but is rarely useful in production." })) : null, _jsx(Field, { label: "Subscription name", value: name, onChange: setName }), _jsx(Label, { children: "Publications to subscribe to" }), pubOptions.length === 0 ? (_jsx("div", { style: { fontSize: 11, color: "var(--muted)" }, children: "No publications visible on the selected publisher yet (try again after its snapshot lands, or create one first)." })) : (_jsx("div", { style: { display: "grid", gap: 4, fontSize: 12 }, children: pubOptions.map((p) => (_jsxs("label", { style: { display: "flex", gap: 8, alignItems: "center" }, children: [_jsx("input", { type: "checkbox", checked: picked.has(p), onChange: () => togglePub(p) }), p] }, p))) })), _jsx(Label, { children: "Options" }), _jsxs("div", { style: { display: "grid", gap: 4, fontSize: 12 }, children: [_jsxs("label", { style: { display: "flex", gap: 8, alignItems: "center" }, children: [_jsx("input", { type: "checkbox", checked: enabled, onChange: (e) => setEnabled(e.target.checked) }), "Enabled"] }), _jsxs("label", { style: { display: "flex", gap: 8, alignItems: "center" }, children: [_jsx("input", { type: "checkbox", checked: createSlot, onChange: (e) => setCreateSlot(e.target.checked) }), "Create replication slot on publisher"] }), _jsxs("label", { style: { display: "flex", gap: 8, alignItems: "center" }, children: [_jsx("input", { type: "checkbox", checked: copyData, onChange: (e) => setCopyData(e.target.checked) }), "Copy existing data"] })] }), _jsx(Field, { label: "Slot name (optional \u2014 defaults to the subscription name)", value: slotName, onChange: setSlotName }), _jsx(ResultBlock, { result: result, error: error }), _jsxs("div", { style: { display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }, children: [_jsx("button", { onClick: onClose, children: "Cancel" }), _jsx("button", { disabled: !canSubmit, onClick: () => {
                                setError(null);
                                setResult(null);
                                m.mutate();
                            }, children: m.isPending ? "Creating…" : "Create subscription" })] })] }) }));
}
