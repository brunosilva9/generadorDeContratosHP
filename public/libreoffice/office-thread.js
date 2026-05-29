// SPDX-License-Identifier: MIT
// Runs inside the ZetaOffice (LibreOffice WASM) worker thread.
// Receives docx bytes via the Emscripten FS and exports them to PDF using the
// UNO `writer_pdf_Export` filter. Driven by src/lib/pdf-libreoffice.js.
import { ZetaHelperThread } from './zetaHelper.js';

const zHT = new ZetaHelperThread();
const zetajs = zHT.zetajs;
const css = zHT.css;

let xModel;

function start() {
  const beanHidden = new css.beans.PropertyValue({ Name: 'Hidden', Value: true });
  const beanOverwrite = new css.beans.PropertyValue({ Name: 'Overwrite', Value: true });
  const beanPdfExport = new css.beans.PropertyValue({ Name: 'FilterName', Value: 'writer_pdf_Export' });

  zHT.thrPort.onmessage = (e) => {
    if (e.data.cmd !== 'convert') {
      throw Error('Unknown message command: ' + e.data.cmd);
    }
    const { from, to, id } = e.data;
    try {
      if (xModel !== undefined &&
          xModel.queryInterface(zetajs.type.interface(css.util.XCloseable))) {
        xModel.close(false);
        xModel = undefined;
      }
      xModel = zHT.desktop.loadComponentFromURL('file://' + from, '_blank', 0, [beanHidden]);
      xModel.storeToURL('file://' + to, [beanOverwrite, beanPdfExport]);
      zetajs.mainPort.postMessage({ cmd: 'converted', id, from, to });
    } catch (err) {
      const exc = zetajs.catchUnoException(err);
      zetajs.mainPort.postMessage({
        cmd: 'error',
        id,
        message: String(exc?.Message ?? err?.message ?? err),
      });
    }
  };

  zHT.thrPort.postMessage({ cmd: 'ready' });
}

start();
