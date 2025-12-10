// client/src/pdf-worker-setup.js
import * as pdfjsLib from 'pdfjs-dist/build/pdf'
// v4 usa .mjs; fallback p/ versões antigas fica a cargo do postinstall
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.mjs'
