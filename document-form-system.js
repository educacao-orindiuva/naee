const DocumentFormSystem = (() => {
  let config = {};
  let previewReady = false;

  function sanitizeFilePart(value) {
    return (value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60);
  }

  function maskDate(input) {
    let value = input.value.replace(/\D/g, "");
    if (value.length > 2) value = `${value.slice(0, 2)}/${value.slice(2)}`;
    if (value.length > 5) value = `${value.slice(0, 5)}/${value.slice(5, 9)}`;
    input.value = value;
  }

  function getNodes() {
    return {
      form: document.getElementById("formulario-base"),
      preview: document.getElementById("documento-final-pdf"),
      editScreen: document.getElementById("tela-edicao"),
      previewScreen: document.getElementById("tela-preview"),
    };
  }

  function defaultFileName() {
    const studentField = document.querySelector(config.studentSelector || '[placeholder*="aluno"]');
    const studentName = sanitizeFilePart(studentField?.value);
    const baseName = sanitizeFilePart(config.fileNameBase || config.documentName || "Documento_NAEE");
    const today = new Date().toLocaleDateString("pt-BR").replace(/\//g, "-");

    if (studentName) {
      return `${baseName}_${studentName}_${today}.pdf`;
    }

    return config.fileName || `${baseName}_${today}.pdf`;
  }

  function storageKey() {
    return `naee:${location.pathname}`;
  }

  function updateStatus(message, type = "info") {
    const status = document.getElementById("status-envio");
    if (!status) return;
    status.textContent = message;
    status.style.display = "block";
    status.style.background = type === "error" ? "#fdecea" : "#eef7ee";
    status.style.color = type === "error" ? "#8a1f17" : "#1f4d28";
    status.style.border = `1px solid ${type === "error" ? "#f5c2c0" : "#b7dfbe"}`;
  }

  function collectFormState() {
    const { form } = getNodes();
    const fields = Array.from(
      form.querySelectorAll("input, select, textarea")
    );

    return fields.map((field, index) => {
      const key = field.name || field.id || `${field.tagName.toLowerCase()}-${index}`;
      const base = {
        key,
        tag: field.tagName,
        type: field.type || "",
      };

      if (field.type === "checkbox" || field.type === "radio") {
        return { ...base, checked: field.checked };
      }

      return { ...base, value: field.value };
    });
  }

  function getRequiredFields() {
    const selectors = config.requiredSelectors || [
      'input[placeholder*="professor"]',
      'input[placeholder*="aluno"]',
      '#select-escola',
    ];

    return selectors
      .map((selector) => document.querySelector(selector))
      .filter(Boolean);
  }

  function getFieldLabel(field) {
    const wrapper = field.closest(".coluna, .coluna-maior, .form-group, label") || field.parentElement;
    const label = wrapper?.querySelector("label");
    return label?.innerText?.replace("*", "").trim() || field.placeholder || "Campo obrigatório";
  }

  function isFieldFilled(field) {
    if (field.type === "checkbox" || field.type === "radio") return field.checked;
    return String(field.value || "").trim().length > 0;
  }

  function validateRequiredFields() {
    const required = getRequiredFields();
    let firstInvalid = null;

    required.forEach((field) => {
      const filled = isFieldFilled(field);
      field.classList.toggle("field-invalid", !filled);
      if (!filled && !firstInvalid) firstInvalid = field;
    });

    if (firstInvalid) {
      const label = getFieldLabel(firstInvalid);
      updateStatus(`Preencha o campo obrigatório: ${label}.`, "error");
      firstInvalid.scrollIntoView({ behavior: "smooth", block: "center" });
      firstInvalid.focus?.();
      return false;
    }

    return true;
  }

  function saveDraft() {
    try {
      localStorage.setItem(storageKey(), JSON.stringify(collectFormState()));
    } catch (error) {
      console.error("Nao foi possivel salvar o rascunho.", error);
    }
  }

  function restoreDraft() {
    try {
      const raw = localStorage.getItem(storageKey());
      if (!raw) return;

      const savedState = JSON.parse(raw);
      const { form } = getNodes();
      const fields = Array.from(form.querySelectorAll("input, select, textarea"));

      savedState.forEach((saved, index) => {
        const field = fields[index];
        if (!field) return;

        if (field.type === "checkbox" || field.type === "radio") {
          field.checked = Boolean(saved.checked);
          return;
        }

        field.value = saved.value || "";
      });
    } catch (error) {
      console.error("Nao foi possivel restaurar o rascunho.", error);
    }
  }

  function removeLegacyUI() {
    document.querySelectorAll(".app-topbar").forEach((node) => node.remove());
    const oldButton = document.getElementById("btn-limpar-rascunho");
    if (oldButton) oldButton.remove();
  }

  function replaceTextInputs(originalRoot, cloneRoot) {
    const originalFields = originalRoot.querySelectorAll('input[type="text"]');
    const clonedFields = cloneRoot.querySelectorAll('input[type="text"]');

    clonedFields.forEach((field, index) => {
      const span = document.createElement("span");
      span.className = "texto-injetado";
      const value = originalFields[index].value;
      span.innerText = value || (field.classList.contains("bim-input") ? "___" : "___________________");
      field.parentNode.replaceChild(span, field);
    });
  }

  function replaceSelects(originalRoot, cloneRoot) {
    const originalFields = originalRoot.querySelectorAll("select");
    const clonedFields = cloneRoot.querySelectorAll("select");
    let schoolImage = "";

    clonedFields.forEach((field, index) => {
      const span = document.createElement("span");
      span.className = "texto-injetado";
      const original = originalFields[index];
      if (original.id === "select-escola") {
        schoolImage = original.value;
      }
      span.innerText =
        original.selectedIndex > 0
          ? original.options[original.selectedIndex].text
          : "___________________";
      field.parentNode.replaceChild(span, field);
    });

    return schoolImage;
  }

  function replaceTextareas(originalRoot, cloneRoot) {
    const originalFields = originalRoot.querySelectorAll("textarea");
    const clonedFields = cloneRoot.querySelectorAll("textarea");

    clonedFields.forEach((field, index) => {
      const div = document.createElement("div");
      div.className = "textarea-injetado";
      div.innerText = originalFields[index].value || "(Sem resposta)";
      field.parentNode.replaceChild(div, field);
    });
  }

  function replaceChecks(originalRoot, cloneRoot) {
    const originalFields = originalRoot.querySelectorAll(
      'input[type="checkbox"], input[type="radio"]'
    );
    const clonedFields = cloneRoot.querySelectorAll(
      'input[type="checkbox"], input[type="radio"]'
    );

    clonedFields.forEach((field, index) => {
      const span = document.createElement("span");
      span.className = "check-injetado";
      span.innerText = originalFields[index].checked ? "[ X ]" : "[   ]";
      field.parentNode.replaceChild(span, field);
    });
  }

  function buildFooterHTML(schoolImage) {
    const now = new Date();
    let longDate = now.toLocaleDateString("pt-BR", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    longDate = longDate.charAt(0).toUpperCase() + longDate.slice(1);

    return `
      <div class="rodape-oficial">
        <div class="logos-rodape">
          <img src="orindiuva-logo.png" alt="Prefeitura">
          <img src="sme-logo.png" alt="SME">
          <img src="logo-naee-2.png" alt="NAEE">
          ${schoolImage ? `<img src="${schoolImage}" alt="Escola">` : ""}
        </div>
        <div class="data-hora-rodape">
          Documento gerado pelo sistema NAEE em: ${longDate} as ${now.toLocaleTimeString("pt-BR")}
        </div>
      </div>
    `;
  }

  function buildPreview() {
    if (!validateRequiredFields()) return;
    const { form, preview, editScreen, previewScreen } = getNodes();
    const clone = form.cloneNode(true);
    clone.id = "conteudo-limpo";

    replaceTextInputs(form, clone);
    const schoolImage = replaceSelects(form, clone);
    replaceTextareas(form, clone);
    replaceChecks(form, clone);
    clone.insertAdjacentHTML("beforeend", buildFooterHTML(schoolImage));

    preview.innerHTML = "";
    preview.appendChild(clone);

    editScreen.style.display = "none";
    previewScreen.style.display = "block";
    previewReady = true;
    updateStatus("Documento pronto para salvar em PDF ou compartilhar por e-mail.");
    window.scrollTo(0, 0);
  }

  function backToEdit() {
    const { editScreen, previewScreen } = getNodes();
    previewScreen.style.display = "none";
    editScreen.style.display = "block";
  }

  async function getPdfBlob() {
    if (!previewReady) buildPreview();
    const previewElement = document.getElementById("documento-final-pdf");

    const worker = html2pdf().set({
      margin: 10,
      filename: defaultFileName(),
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      pagebreak: { mode: ["avoid-all", "css", "legacy"] },
    }).from(previewElement);

    return worker.outputPdf("blob");
  }

  async function downloadPdf() {
    try {
      if (!validateRequiredFields()) return;
      if (!previewReady) buildPreview();
      await html2pdf().set({
        margin: 10,
        filename: defaultFileName(),
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ["avoid-all", "css", "legacy"] },
      }).from(document.getElementById("documento-final-pdf")).save();
      updateStatus("PDF salvo com sucesso.");
    } catch (error) {
      console.error("Erro ao gerar PDF.", error);
      updateStatus("Nao foi possivel salvar o PDF.", "error");
    }
  }

  function buildMailto() {
    const subject = encodeURIComponent(config.emailSubject || "Documento preenchido - NAEE");
    const body = encodeURIComponent(
      config.emailBody ||
        "Ola,\n\nSegue o documento preenchido em PDF.\nCaso o anexo nao seja incluído automaticamente, selecione o arquivo salvo no seu dispositivo.\n\nAtenciosamente."
    );
    const recipient = config.emailTo || "";
    return `mailto:${recipient}?subject=${subject}&body=${body}`;
  }

  async function sendEmail() {
    try {
      if (!validateRequiredFields()) return;
      const blob = await getPdfBlob();
      const file = new File([blob], defaultFileName(), { type: "application/pdf" });

      if (navigator.canShare && navigator.share && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: config.emailSubject || "Documento preenchido - NAEE",
          text: "Compartilhe o PDF preenchido pelo canal desejado, inclusive e-mail.",
          files: [file],
        });
        updateStatus("PDF preparado para compartilhamento.");
        return;
      }

      await downloadPdf();
      window.location.href = buildMailto();
      updateStatus("Seu navegador abriu o e-mail. Anexe o PDF salvo, se necessario.");
    } catch (error) {
      console.error("Erro ao preparar envio por e-mail.", error);
      updateStatus("Nao foi possivel preparar o envio por e-mail.", "error");
    }
  }

  function attachDraftListeners() {
    const { form } = getNodes();
    form.querySelectorAll("input, select, textarea").forEach((field) => {
      field.addEventListener("input", saveDraft);
      field.addEventListener("change", saveDraft);
      field.addEventListener("input", () => field.classList.remove("field-invalid"));
      field.addEventListener("change", () => field.classList.remove("field-invalid"));
    });
  }

  function init(userConfig) {
    config = userConfig || {};
    removeLegacyUI();
    restoreDraft();
    attachDraftListeners();
  }

  return {
    init,
    maskDate,
    buildPreview,
    backToEdit,
    downloadPdf,
    sendEmail,
  };
})();
