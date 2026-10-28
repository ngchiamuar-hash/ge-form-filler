# GE Form Filler (web)

Fills Great Eastern ePartner PDF forms from ePartner screenshots, inside your browser.

- **Your data stays on your computer.** Forms, screenshots and customer details are read and filled in the browser. Nothing is uploaded; there is no server.
- **Blank GE forms are built in** (`forms/`, list in `forms/index.json`), so the app works on phones too. Only blank forms are stored here — never customer data.
- **Fully set up:** Nomination (NBZ-FNOMI-V07, New Business copy), Request for Amendment (NBZ-FRQAM-V08), Gastric Questionnaire (NBZ-QGAS1-V05e). All other forms get a basic fill: Proposal No., Policy No., customer name and NRIC.
- Approved forms download as PDF. Settings and the run log are kept in this browser only.

Works on phone (Safari/Chrome) and laptop. Libraries (pdf-lib, PDF.js, Tesseract.js) load from the jsDelivr CDN.
