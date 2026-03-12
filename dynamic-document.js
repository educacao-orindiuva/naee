const DynamicDocumentApp = (() => {
  let model = null;
  let previewReady = false;

  function qs(selector, root = document) {
    return root.querySelector(selector);
  }

  function qsa(selector, root = document) {
    return Array.from(root.querySelectorAll(selector));
  }

  function getModelId() {
    return new URLSearchParams(window.location.search).get("model");
  }

  function maskDate(input) {
    let value = input.value.replace(/\D/g, "");
    if (value.length > 2) value = `${value.slice(0, 2)}/${value.slice(2)}`;
    if (value.length > 5) value = `${value.slice(0, 5)}/${value.slice(5, 9)}`;
    input.value = value;
  }

  function sanitizeFilePart(value) {
    return (value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60);
  }

  function draftKey() {
    return `naee-dynamic:${model.id}`;
  }

  function fileName() {
    const student = sanitizeFilePart(qs('[name="student_name"]')?.value);
    const today = new Date().toLocaleDateString("pt-BR").replace(/\//g, "-");
    return student
      ? `${model.fileNameBase}_${student}_${today}.pdf`
      : `${model.fileNameBase}_${today}.pdf`;
  }

  function updateStatus(message, type = "info") {
    const status = qs("#status-envio");
    if (!status) return;
    status.style.display = "block";
    status.textContent = message;
    status.style.background = type === "error" ? "#fdecea" : "#eef7ee";
    status.style.color = type === "error" ? "#8a1f17" : "#1f4d28";
    status.style.border = `1px solid ${type === "error" ? "#f5c2c0" : "#b7dfbe"}`;
  }

  function headerField(label, name, type = "text", options = []) {
    if (type === "select") {
      return `
        <div class="coluna">
          <label>${label}</label>
          <select name="${name}">
            ${options.map((option) => {
              const value = typeof option === "string" ? option : option.value;
              const text = typeof option === "string" ? (option || "Selecione...") : option.label;
              return `<option value="${value}">${text || "Selecione..."}</option>`;
            }).join("")}
          </select>
        </div>
      `;
    }

    return `
      <div class="coluna">
        <label>${label}</label>
        <input type="text" name="${name}" ${type === "date" ? 'maxlength="10" data-mask="date" placeholder="DD/MM/AAAA"' : ""}>
      </div>
    `;
  }

  function renderHeader() {
    return `
      <div class="common-header">
        <div class="linha-form">
          ${headerField("Professor(a):", "teacher_name")}
        </div>
        <div class="linha-form">
          ${headerField("Nome do Aluno:", "student_name")}
        </div>
        ${model.header.showDateOfBirth ? `
          <div class="linha-form">
            <div class="coluna" style="max-width: 300px;">
              <label>Data de Nasc.:</label>
              <input type="text" name="date_of_birth" maxlength="10" data-mask="date" placeholder="DD/MM/AAAA">
            </div>
          </div>
        ` : ""}
        <div class="linha-form">
          ${model.header.showSchool ? headerField("Escola:", "school", "select", SCHOOL_OPTIONS) : ""}
          ${model.header.showGrade ? headerField("Série:", "grade", "select", GRADE_OPTIONS) : ""}
          ${model.header.showClassroom ? headerField("Turma:", "classroom", "select", CLASSROOM_OPTIONS) : ""}
        </div>
      </div>
    `;
  }

  function renderCheckboxGroup(section, index) {
    return `
      <div class="form-group" data-section-index="${index}">
        <label>${section.label}</label>
        <div class="checkbox-group">
          ${section.options.map((option, optionIndex) => `
            <label><input type="checkbox" name="sec_${index}_opt_${optionIndex}" value="${option}"> ${option}</label>
          `).join("")}
          ${section.otherLabel ? `<label>${section.otherLabel}: <input type="text" name="sec_${index}_other" style="width: auto;"></label>` : ""}
        </div>
      </div>
    `;
  }

  function renderRadioGroup(section, index) {
    return `
      <div class="form-group" data-section-index="${index}">
        <label>${section.label}</label>
        <div class="checkbox-group" style="display: flex; gap: 15px; flex-wrap: wrap;">
          ${section.options.map((option, optionIndex) => `
            <label><input type="radio" name="sec_${index}_radio" value="${optionIndex}"> ${option}</label>
          `).join("")}
        </div>
      </div>
    `;
  }

  function renderTextareaGroup(section, index) {
    return section.fields.map((field, fieldIndex) => `
      <div class="form-group" data-section-index="${index}">
        <label>${field.label}</label>
        <textarea name="sec_${index}_textarea_${fieldIndex}"></textarea>
      </div>
    `).join("");
  }

  function renderMatrixRadio(section, index) {
    return `
      <label>${section.title}</label>
      <table data-section-index="${index}">
        <tr>
          <th>Habilidade</th>
          ${section.columns.map((column) => `<th>${column}</th>`).join("")}
        </tr>
        ${section.rows.map((row, rowIndex) => `
          <tr>
            <td>${row}</td>
            ${section.columns.map((_, columnIndex) => `
              <td><input type="radio" name="sec_${index}_row_${rowIndex}" value="${columnIndex}"></td>
            `).join("")}
          </tr>
        `).join("")}
      </table>
    `;
  }

  function renderMatrixText(section, index) {
    return `
      <label>${section.title}</label>
      <table data-section-index="${index}">
        <tr>
          <th>Habilidade</th>
          ${section.columns.map((column) => `<th>${column}</th>`).join("")}
        </tr>
        ${section.rows.map((row, rowIndex) => `
          <tr>
            <td>${row}</td>
            ${section.columns.map((_, columnIndex) => `
              <td><input type="text" class="bim-input" maxlength="1" name="sec_${index}_row_${rowIndex}_col_${columnIndex}"></td>
            `).join("")}
          </tr>
        `).join("")}
      </table>
    `;
  }

  function renderSingleInput(section, index) {
    return `
      <div class="form-group" data-section-index="${index}">
        <label>${section.label}</label>
        <div style="width: 200px;">
          <input type="text" name="sec_${index}_single" ${section.inputType === "date" ? 'maxlength="10" data-mask="date" placeholder="DD/MM/AAAA"' : ""}>
        </div>
      </div>
    `;
  }

  function renderStaticText(section) {
    return section.paragraphs.map((paragraph) => `
      <p style="font-size: 14px; text-align: justify; margin-top: 20px;">${paragraph}</p>
    `).join("");
  }

  function renderLegend(section) {
    return `<p style="font-size: 14px; margin-bottom: 5px;"><strong>${section.text}</strong></p>`;
  }

  function renderCityDateSignature(section, index) {
    return `
      <div class="form-group" data-section-index="${index}" style="margin-top:20px;">
        <p style="font-size: 16px;">
          ${section.city}, 
          <input type="text" name="sec_${index}_day" style="width: 40px; border-bottom: 1px solid #000;">
          de <input type="text" name="sec_${index}_month" style="width: 150px; border-bottom: 1px solid #000;">
          de 20<input type="text" name="sec_${index}_year" style="width: 40px; border-bottom: 1px solid #000;">
        </p>
      </div>
      ${renderSignatureOnly(section)}
    `;
  }

  function renderSignatureOnly(section) {
    return `
      <div class="assinaturas">
        ${section.signatures.map((signature) => `
          <div class="assinatura-box"><div class="assinatura-linha">${signature}</div></div>
        `).join("")}
      </div>
    `;
  }

  function renderSection(section, index) {
    switch (section.type) {
      case "checkbox_group":
        return renderCheckboxGroup(section, index);
      case "radio_group":
        return renderRadioGroup(section, index);
      case "textarea_group":
        return renderTextareaGroup(section, index);
      case "matrix_radio":
        return renderMatrixRadio(section, index);
      case "matrix_text":
        return renderMatrixText(section, index);
      case "single_input":
        return renderSingleInput(section, index);
      case "static_text":
        return renderStaticText(section);
      case "legend":
        return renderLegend(section);
      case "city_date_signature":
        return renderCityDateSignature(section, index);
      case "signature_only":
        return renderSignatureOnly(section);
      default:
        return "";
    }
  }

  function renderForm() {
    qs("#document-title").textContent = model.title;
    qs("#formulario-base").innerHTML = `
      <div class="header-logo"><img src="logo-naee-2.png" alt="NAEE"></div>
      ${renderHeader()}
      <div class="doc-title">${model.title.toUpperCase()}</div>
      ${model.sections.map((section, index) => renderSection(section, index)).join("")}
    `;
  }

  function attachMasks() {
    qsa("[data-mask='date']").forEach((input) => {
      input.addEventListener("input", () => maskDate(input));
    });
  }

  function collectFields() {
    return qsa("#formulario-base input, #formulario-base select, #formulario-base textarea");
  }

  function saveDraft() {
    const state = collectFields().map((field) => {
      if (field.type === "checkbox" || field.type === "radio") {
        return { name: field.name, type: field.type, checked: field.checked, value: field.value };
      }
      return { name: field.name, type: field.type, value: field.value };
    });

    localStorage.setItem(draftKey(), JSON.stringify(state));
  }

  function restoreDraft() {
    const raw = localStorage.getItem(draftKey());
    if (!raw) return;

    const state = JSON.parse(raw);
    state.forEach((saved) => {
      const fields = qsa(`[name="${saved.name}"]`);
      fields.forEach((field) => {
        if (field.type === "checkbox" || field.type === "radio") {
          field.checked = Boolean(saved.checked) && field.value === saved.value;
        } else {
          field.value = saved.value || "";
        }
      });
    });
  }

  function attachDraftListeners() {
    collectFields().forEach((field) => {
      field.addEventListener("input", saveDraft);
      field.addEventListener("change", saveDraft);
    });
  }

  function validate() {
    const required = [
      qs('[name="teacher_name"]'),
      qs('[name="student_name"]'),
      qs('[name="school"]'),
    ].filter(Boolean);

    for (const field of required) {
      const filled = String(field.value || "").trim() !== "";
      field.classList.toggle("field-invalid", !filled);
      if (!filled) {
        updateStatus("Preencha professor, aluno e escola antes de concluir.", "error");
        field.scrollIntoView({ behavior: "smooth", block: "center" });
        field.focus();
        return false;
      }
    }

    return true;
  }

  function formatValue(field) {
    if (field.tagName === "SELECT") {
      return field.selectedIndex > 0 ? field.options[field.selectedIndex].text : "___________________";
    }
    return field.value || (field.classList.contains("bim-input") ? "___" : "___________________");
  }

  function buildFooter(schoolImage) {
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
        <div class="data-hora-rodape">Documento gerado pelo sistema NAEE em: ${longDate} as ${now.toLocaleTimeString("pt-BR")}</div>
      </div>
    `;
  }

  function buildPreview() {
    if (!validate()) return;

    const original = qs("#formulario-base");
    const preview = qs("#documento-final-pdf");
    const clone = original.cloneNode(true);
    let schoolImage = "";

    qsa("input[type='text']", clone).forEach((field, index) => {
      const originalField = qsa("input[type='text']", original)[index];
      const span = document.createElement("span");
      span.className = "texto-injetado";
      span.innerText = originalField.value || (originalField.classList.contains("bim-input") ? "___" : "___________________");
      field.parentNode.replaceChild(span, field);
    });

    qsa("select", clone).forEach((field, index) => {
      const originalField = qsa("select", original)[index];
      if (originalField.name === "school") schoolImage = originalField.value;
      const span = document.createElement("span");
      span.className = "texto-injetado";
      span.innerText = formatValue(originalField);
      field.parentNode.replaceChild(span, field);
    });

    qsa("textarea", clone).forEach((field, index) => {
      const originalField = qsa("textarea", original)[index];
      const div = document.createElement("div");
      div.className = "textarea-injetado";
      div.innerText = originalField.value || "(Sem resposta)";
      field.parentNode.replaceChild(div, field);
    });

    qsa("input[type='checkbox'], input[type='radio']", clone).forEach((field, index) => {
      const originalField = qsa("input[type='checkbox'], input[type='radio']", original)[index];
      const span = document.createElement("span");
      span.className = "check-injetado";
      span.innerText = originalField.checked ? "[ X ]" : "[   ]";
      field.parentNode.replaceChild(span, field);
    });

    clone.insertAdjacentHTML("beforeend", buildFooter(schoolImage));
    preview.innerHTML = "";
    preview.appendChild(clone);
    qs("#tela-edicao").style.display = "none";
    qs("#tela-preview").style.display = "block";
    previewReady = true;
    window.scrollTo(0, 0);
    updateStatus("Documento pronto para salvar em PDF ou enviar.");
  }

  function backToEdit() {
    qs("#tela-preview").style.display = "none";
    qs("#tela-edicao").style.display = "block";
  }

  async function pdfBlob() {
    if (!previewReady) buildPreview();
    return html2pdf().set({
      margin: 10,
      filename: fileName(),
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      pagebreak: { mode: ["avoid-all", "css", "legacy"] },
    }).from(qs("#documento-final-pdf")).outputPdf("blob");
  }

  async function downloadPdf() {
    if (!validate()) return;
    if (!previewReady) buildPreview();

    await html2pdf().set({
      margin: 10,
      filename: fileName(),
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      pagebreak: { mode: ["avoid-all", "css", "legacy"] },
    }).from(qs("#documento-final-pdf")).save();

    updateStatus("PDF salvo com sucesso.");
  }

  function buildMailto() {
    const subject = encodeURIComponent(model.emailSubject);
    const body = encodeURIComponent("Olá,\n\nSegue o documento preenchido em PDF.\nSe o arquivo não for anexado automaticamente, selecione o PDF salvo no dispositivo.\n");
    return `mailto:naee@orindiuva-edu.com?subject=${subject}&body=${body}`;
  }

  async function sendEmail() {
    if (!validate()) return;

    try {
      const blob = await pdfBlob();
      const file = new File([blob], fileName(), { type: "application/pdf" });

      if (navigator.canShare && navigator.share && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: model.title,
          text: "Compartilhe o PDF preenchido.",
          files: [file],
        });
        updateStatus("PDF preparado para compartilhamento.");
        return;
      }

      await downloadPdf();
      window.location.href = buildMailto();
      updateStatus("E-mail aberto. Se necessário, anexe o PDF salvo.");
    } catch (error) {
      console.error(error);
      updateStatus("Não foi possível preparar o envio por e-mail.", "error");
    }
  }

  function init() {
    const modelId = getModelId();
    model = DOCUMENT_MODELS[modelId];

    if (!model) {
      qs("#tela-edicao").innerHTML = '<div class="folha-a4"><p>Modelo de documento não encontrado.</p><p><a href="index.html">Voltar ao menu</a></p></div>';
      return;
    }

    renderForm();
    attachMasks();
    restoreDraft();
    attachDraftListeners();

    window.gerarEspelho = buildPreview;
    window.voltarEdicao = backToEdit;
    window.baixarPDF = downloadPdf;
    window.enviarEmail = sendEmail;
  }

  return { init };
})();
