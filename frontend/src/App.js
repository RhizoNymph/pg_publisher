import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { ConnectionsList } from "./views/ConnectionsList";
import { Topology } from "./views/Topology";
import { MetricsPanel } from "./views/MetricsPanel";
import { NewPublicationModal } from "./views/actions/NewPublicationModal";
import { NewSubscriptionModal } from "./views/actions/NewSubscriptionModal";
import { CloneSchemaModal } from "./views/actions/CloneSchemaModal";
import { CopyIndexesModal } from "./views/actions/CopyIndexesModal";
export function App() {
    const [selectedConnectionId, setSelectedConnectionId] = useState(null);
    const [selectedStream, setSelectedStream] = useState(null);
    const [openModal, setOpenModal] = useState(null);
    return (_jsxs("div", { className: "app", children: [_jsxs("div", { className: "topbar", children: [_jsx("h1", { children: "pg_publisher" }), _jsxs("div", { style: { marginLeft: "auto", display: "flex", gap: 6 }, children: [_jsx("button", { onClick: () => setOpenModal("pub"), children: "+ Publication" }), _jsx("button", { onClick: () => setOpenModal("sub"), children: "+ Subscription" }), _jsx("button", { onClick: () => setOpenModal("clone"), children: "Clone schema" }), _jsx("button", { onClick: () => setOpenModal("indexes"), children: "Copy indexes" })] })] }), _jsx(ConnectionsList, { selectedId: selectedConnectionId, onSelect: setSelectedConnectionId }), _jsx("div", { style: { position: "relative", width: "100%", height: "100%", minHeight: 0 }, children: _jsx(Topology, { onSelectStream: setSelectedStream }) }), _jsx(MetricsPanel, { selected: selectedStream }), openModal === "pub" ? (_jsx(NewPublicationModal, { onClose: () => setOpenModal(null) })) : null, openModal === "sub" ? (_jsx(NewSubscriptionModal, { onClose: () => setOpenModal(null) })) : null, openModal === "clone" ? (_jsx(CloneSchemaModal, { onClose: () => setOpenModal(null) })) : null, openModal === "indexes" ? (_jsx(CopyIndexesModal, { onClose: () => setOpenModal(null) })) : null] }));
}
