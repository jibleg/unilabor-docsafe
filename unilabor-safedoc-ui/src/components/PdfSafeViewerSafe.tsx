import { Viewer, Worker } from '@react-pdf-viewer/core';
import {
  defaultLayoutPlugin,
  type DefaultLayoutPluginProps,
} from '@react-pdf-viewer/default-layout';
import type { TransformToolbarSlot } from '@react-pdf-viewer/toolbar';

import '@react-pdf-viewer/default-layout/lib/styles/index.css';

import { useAuthStore } from '../store/useAuthStore';

const hideUnsafeActions: TransformToolbarSlot = (toolbarSlot) => ({
  ...toolbarSlot,
  Open: () => <></>,
  OpenMenuItem: () => <></>,
  Download: () => <></>,
  DownloadMenuItem: () => <></>,
  Print: () => <></>,
  PrintMenuItem: () => <></>,
});

export const PdfSafeViewer = ({ fileUrl }: { fileUrl: string }) => {
  const token = useAuthStore((state) => state.token);

  let renderDefaultToolbar!: ReturnType<typeof defaultLayoutPlugin>['toolbarPluginInstance']['renderDefaultToolbar'];

  const renderToolbar: NonNullable<DefaultLayoutPluginProps['renderToolbar']> = (
    Toolbar
  ) => <Toolbar>{renderDefaultToolbar(hideUnsafeActions)}</Toolbar>;

  const defaultLayoutPluginInstance = defaultLayoutPlugin({
    renderToolbar,
  });

  renderDefaultToolbar = defaultLayoutPluginInstance.toolbarPluginInstance.renderDefaultToolbar;

  return (
    <div className="h-[80vh] border border-slate-800 rounded-xl overflow-hidden shadow-inner bg-slate-950">
      <Worker workerUrl="https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js">
        <Viewer
          fileUrl={fileUrl}
          httpHeaders={{
            Authorization: `Bearer ${token}`,
          }}
          plugins={[defaultLayoutPluginInstance]}
        />
      </Worker>
    </div>
  );
};
