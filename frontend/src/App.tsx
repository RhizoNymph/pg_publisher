import { useState } from "react";
import { ConnectionsList } from "./views/ConnectionsList";
import { Topology } from "./views/Topology";
import { MetricsPanel } from "./views/MetricsPanel";
import { NewPublicationModal } from "./views/actions/NewPublicationModal";
import { NewSubscriptionModal } from "./views/actions/NewSubscriptionModal";
import { CloneSchemaModal } from "./views/actions/CloneSchemaModal";
import { CopyIndexesModal } from "./views/actions/CopyIndexesModal";

type ModalName = "pub" | "sub" | "clone" | "indexes" | null;

export function App() {
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [selectedStream, setSelectedStream] = useState<{
    connectionId: string;
    kind: string;
    name: string;
  } | null>(null);
  const [openModal, setOpenModal] = useState<ModalName>(null);

  return (
    <div className="app">
      <div className="topbar">
        <h1>pg_publisher</h1>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <button onClick={() => setOpenModal("pub")}>+ Publication</button>
          <button onClick={() => setOpenModal("sub")}>+ Subscription</button>
          <button onClick={() => setOpenModal("clone")}>Clone schema</button>
          <button onClick={() => setOpenModal("indexes")}>Copy indexes</button>
        </div>
      </div>
      <ConnectionsList
        selectedId={selectedConnectionId}
        onSelect={setSelectedConnectionId}
      />
      <div style={{ position: "relative", width: "100%", height: "100%", minHeight: 0 }}>
        <Topology onSelectStream={setSelectedStream} />
      </div>
      <MetricsPanel
        selected={selectedStream}
        onDropped={() => setSelectedStream(null)}
      />

      {openModal === "pub" ? (
        <NewPublicationModal onClose={() => setOpenModal(null)} />
      ) : null}
      {openModal === "sub" ? (
        <NewSubscriptionModal onClose={() => setOpenModal(null)} />
      ) : null}
      {openModal === "clone" ? (
        <CloneSchemaModal onClose={() => setOpenModal(null)} />
      ) : null}
      {openModal === "indexes" ? (
        <CopyIndexesModal onClose={() => setOpenModal(null)} />
      ) : null}
    </div>
  );
}
