(() => {
  const S = window.SITE || {};
  const dois = (n) => String(Math.floor(n)).padStart(2, "0");
  // segundos → HH:MM:SS:FF (timecode de câmera)
  const tempo = (seg, fps) => `${dois(seg / 3600)}:${dois((seg / 60) % 60)}:${dois(seg % 60)}:${dois((seg % 1) * fps)}`;
  const reduzir = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const celular = matchMedia("(max-width: 760px)").matches;


  /* ── Rolagem que toca o vídeo ─────────────────────────────────────────── */
  const cine = document.querySelector(".cine");
  const canvas = cine && cine.querySelector(".cine-canvas");
  if (cine && canvas && S.frames && S.frames.total) {
    const ctx = canvas.getContext("2d");
    const total = S.frames.total;
    const padrao = celular ? S.frames.mobile : S.frames.desktop;
    const src = (i) => padrao.replace("{n}", String(i + 1).padStart(4, "0"));
    const quadros = new Array(total);
    const momentos = [...cine.querySelectorAll(".momento")];
    const tc = cine.querySelector("[data-timecode]");
    const fps = S.frames.fps || 24, duracao = S.frames.duracao || 8;
    let tcAnterior = "";
    let alvo = 0, atual = 0, desenhado = -1;

    const carregar = (i) => {
      if (quadros[i]) return quadros[i];
      const img = new Image();
      img.decoding = "async";
      img.src = src(i);
      img.onload = () => { if (Math.round(atual) === i || desenhado === -1) desenhar(i, true); };
      return (quadros[i] = img);
    };

    // Carrega em passadas (1 a cada 8, depois 1 a cada 4…) para cobrir o filme inteiro cedo
    carregar(0);
    if (!reduzir) {
      const fila = [];
      for (const passo of [8, 4, 2, 1]) for (let i = 0; i < total; i += passo) if (!fila.includes(i)) fila.push(i);
      let k = 0;
      const lote = () => { for (let n = 0; n < 6 && k < fila.length; n++) carregar(fila[k++]); if (k < fila.length) setTimeout(lote, 40); };
      lote();
    }

    const pronto = (i) => quadros[i] && quadros[i].complete && quadros[i].naturalWidth;
    const maisProximo = (i) => {
      for (let d = 0; d < total; d++) {
        if (pronto(i - d)) return i - d;
        if (pronto(i + d)) return i + d;
      }
      return -1;
    };

    const ajustar = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
      desenhado = -1;
      desenhar(Math.round(atual), true);
    };

    function desenhar(i, forcar) {
      const j = maisProximo(i);
      if (j < 0 || (j === desenhado && !forcar)) return;
      const img = quadros[j];
      const cw = canvas.width, ch = canvas.height;
      const escala = Math.max(cw / img.naturalWidth, ch / img.naturalHeight); // "cover"
      const w = img.naturalWidth * escala, h = img.naturalHeight * escala;
      ctx.drawImage(img, (cw - w) / 2, (ch - h) / 2, w, h);
      desenhado = j;
    }

    const progresso = () => {
      const r = cine.getBoundingClientRect();
      const curso = cine.offsetHeight - innerHeight;
      return Math.min(1, Math.max(0, -r.top / (curso || 1)));
    };

    const atualizarMomentos = (p) => {
      for (const m of momentos) {
        const de = parseFloat(m.dataset.de || 0), ate = parseFloat(m.dataset.ate || 1);
        m.classList.toggle("ativo", p >= de && (p < ate || (ate >= 1 && p >= 1)));
      }
      cine.classList.toggle("andou", p > 0.02);
    };

    const quadro = () => {
      alvo = progresso() * (total - 1);
      atual += (alvo - atual) * 0.18; // suaviza: sensação de filme, não de slide
      if (Math.abs(alvo - atual) < 0.05) atual = alvo;
      desenhar(Math.round(atual));
      atualizarMomentos(atual / (total - 1));
      if (tc) {
        const t = tempo((atual / (total - 1)) * duracao, fps);
        if (t !== tcAnterior) tc.textContent = tcAnterior = t;
      }
      requestAnimationFrame(quadro);
    };

    addEventListener("resize", ajustar);
    ajustar();
    if (reduzir) atualizarMomentos(0);
    else requestAnimationFrame(quadro);
  }

  /* ── Timeline de serviços: a rolagem empurra a agulha pelos clipes ────── */
  const linha = document.querySelector(".linha");
  const tl = linha && linha.querySelector("[data-timeline]");
  if (tl) {
    const trilhas = tl.querySelector(".tl-trilhas");
    const clipes = [...tl.querySelectorAll(".tl-clipe")];
    const detalhes = [...tl.querySelectorAll(".tl-detalhe")];
    const tlTc = tl.querySelector("[data-tl-tc]");
    const pesos = clipes.map((c) => parseFloat(c.style.getPropertyValue("--g")) || 1);
    const soma = pesos.reduce((a, b) => a + b, 0);
    const limites = pesos.reduce((acc, g) => (acc.push((acc.at(-1) || 0) + g / soma), acc), []);
    // a agulha anda entre 4% e 96% da rolagem da seção
    const A = 0.04, B = 0.96;
    let ativo = -1, fixo = reduzir;

    detalhes.forEach((d, i) => { d.id = `servico-${i + 1}`; clipes[i].setAttribute("aria-controls", d.id); });

    const ativar = (i) => {
      if (i === ativo) return;
      ativo = i;
      clipes.forEach((c, k) => {
        c.classList.toggle("ativo", k === i);
        c.classList.toggle("passou", k < i);
        c.setAttribute("aria-selected", k === i);
        c.tabIndex = k === i ? 0 : -1;
      });
      detalhes.forEach((d, k) => d.classList.toggle("ativo", k === i));
    };
    const meio = (i) => (i ? limites[i - 1] : 0) + (limites[i] - (i ? limites[i - 1] : 0)) / 2;
    const posicionar = (p) => {
      trilhas.style.setProperty("--p", p.toFixed(4));
      let i = limites.findIndex((l) => p < l);
      ativar(i < 0 ? clipes.length - 1 : i);
      if (tlTc) tlTc.textContent = tempo(p * 92, 24);
    };
    const progressoLinha = () => {
      const r = linha.getBoundingClientRect();
      const curso = linha.offsetHeight - innerHeight;
      const bruto = Math.min(1, Math.max(0, -r.top / (curso || 1)));
      return Math.min(1, Math.max(0, (bruto - A) / (B - A)));
    };
    clipes.forEach((c, i) => c.addEventListener("click", () => {
      if (fixo || getComputedStyle(linha).height === "auto") return posicionar(meio(i));
      const curso = linha.offsetHeight - innerHeight;
      const alvo = linha.getBoundingClientRect().top + scrollY + (A + meio(i) * (B - A)) * curso;
      scrollTo({ top: alvo, behavior: "smooth" });
    }));
    tl.addEventListener("keydown", (e) => {
      const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
      if (!d) return;
      const i = Math.min(clipes.length - 1, Math.max(0, ativo + d));
      clipes[i].focus(); clipes[i].click();
    });
    if (fixo) posicionar(meio(0));
    else {
      const rodar = () => posicionar(progressoLinha());
      addEventListener("scroll", () => requestAnimationFrame(rodar), { passive: true });
      addEventListener("resize", rodar);
      rodar();
    }
  }

  /* ── Clientes: carrossel de perfis no celular + lista sincronizada ───── */
  const carrossel = document.querySelector("[data-carrossel]");
  if (carrossel) {
    const secao = carrossel.closest(".secao");
    const telefone = carrossel.closest("[data-celular]");
    const fotos = [...carrossel.querySelectorAll("img")];
    const itens = [...secao.querySelectorAll(".cl-item")];
    const pontos = [...secao.querySelectorAll(".carrossel-ponto")];
    const legenda = secao.querySelector("[data-legenda]");
    const INTERVALO = 5000;
    let atualC = -1, timer = 0, naTela = false, pausado = false;
    secao.style.setProperty("--intervalo", `${INTERVALO}ms`);

    const marcar = (i) => {
      if (i === atualC) return;
      atualC = i;
      itens.forEach((b, k) => { b.setAttribute("aria-selected", k === i); b.tabIndex = k === i ? 0 : -1; });
      if (legenda) {
        legenda.href = itens[i].parentElement.querySelector(".cl-link").href;
        legenda.querySelector("[data-legenda-arroba]").textContent = itens[i].querySelector(".cl-arroba").textContent;
        legenda.querySelector("[data-legenda-info]").textContent = itens[i].querySelector(".cl-info").textContent;
      }
      pontos.forEach((p, k) => {
        p.setAttribute("aria-current", k === i);
        p.classList.remove("correndo");
      });
      if (!reduzir && naTela && !pausado) { void pontos[i].offsetWidth; pontos[i].classList.add("correndo"); }
    };
    const ir = (i, suave = true) => {
      i = (i + fotos.length) % fotos.length;
      carrossel.scrollTo({ left: i * carrossel.clientWidth, behavior: suave && !reduzir ? "smooth" : "auto" });
      marcar(i);
    };
    const agendar = () => {
      clearTimeout(timer);
      pontos.forEach((p) => p.classList.remove("correndo"));
      if (reduzir || !naTela || pausado) return;
      if (pontos[atualC]) { void pontos[atualC].offsetWidth; pontos[atualC].classList.add("correndo"); }
      timer = setTimeout(() => { ir(atualC + 1); agendar(); }, INTERVALO);
    };
    // quem mexe assume o controle: o carrossel espera um pouco antes de voltar a passar sozinho
    const mexeu = () => { pausado = true; agendar(); clearTimeout(mexeu.t); mexeu.t = setTimeout(() => { pausado = false; agendar(); }, 12000); };

    let rolando = 0;
    carrossel.addEventListener("scroll", () => {
      cancelAnimationFrame(rolando);
      rolando = requestAnimationFrame(() => marcar(Math.round(carrossel.scrollLeft / carrossel.clientWidth)));
    }, { passive: true });
    carrossel.addEventListener("pointerdown", mexeu);
    carrossel.addEventListener("touchstart", mexeu, { passive: true });
    carrossel.addEventListener("keydown", (e) => {
      const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
      if (d) { e.preventDefault(); mexeu(); ir(atualC + d); }
    });
    secao.querySelectorAll(".carrossel-seta").forEach((b) => b.addEventListener("click", () => { mexeu(); ir(atualC + Number(b.dataset.dir)); }));
    pontos.forEach((p, i) => p.addEventListener("click", () => { mexeu(); ir(i); }));
    itens.forEach((b, i) => b.addEventListener("click", () => {
      mexeu(); ir(i);
      const r = telefone.getBoundingClientRect();
      if (r.top < 0 || r.bottom > innerHeight) telefone.scrollIntoView({ behavior: reduzir ? "auto" : "smooth", block: "center" });
    }));
    secao.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") { pausado = true; agendar(); } });
    secao.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") { pausado = false; agendar(); } });
    new IntersectionObserver(([e]) => { naTela = e.isIntersecting; agendar(); }, { threshold: 0.35 }).observe(telefone);
    addEventListener("resize", () => ir(atualC, false));
    marcar(0);

    // inclinação 3D acompanhando o mouse
    if (!reduzir && matchMedia("(hover: hover)").matches) {
      secao.addEventListener("pointermove", (e) => {
        const r = telefone.getBoundingClientRect();
        const dx = (e.clientX - (r.left + r.width / 2)) / innerWidth;
        const dy = (e.clientY - (r.top + r.height / 2)) / innerHeight;
        telefone.style.setProperty("--ry", `${(-12 + dx * 22).toFixed(2)}deg`);
        telefone.style.setProperty("--rx", `${(4 - dy * 14).toFixed(2)}deg`);
      });
      secao.addEventListener("pointerleave", () => { telefone.style.removeProperty("--ry"); telefone.style.removeProperty("--rx"); });
    }
  }

  /* ── Parallax leve nas artes ──────────────────────────────────────────── */
  const artes = reduzir ? [] : [...document.querySelectorAll(".arte")];
  if (artes.length) {
    const mover = () => {
      for (const a of artes) {
        const r = a.parentElement.getBoundingClientRect();
        if (r.bottom < 0 || r.top > innerHeight) continue;
        const c = (r.top + r.height / 2 - innerHeight / 2) / innerHeight;
        a.style.transform = `translate3d(0, ${(c * -60).toFixed(1)}px, 0) scale(1.08)`;
      }
    };
    addEventListener("scroll", () => requestAnimationFrame(mover), { passive: true });
    mover();
  }

  /* ── Topo, revelar e ano ──────────────────────────────────────────────── */
  const topo = document.querySelector(".topo");
  const whats = document.querySelector(".whats");
  let formNaTela = false; // o botão flutuante se recolhe para não cobrir o "Enviar"
  const aoRolar = () => {
    topo && topo.classList.toggle("rolou", scrollY > 40);
    whats && whats.classList.toggle("visivel", scrollY > innerHeight * 0.6 && !formNaTela);
  };
  const formEl = document.querySelector(".form");
  if (formEl) new IntersectionObserver(([e]) => { formNaTela = e.isIntersecting; aoRolar(); }).observe(formEl);
  addEventListener("scroll", aoRolar, { passive: true });
  aoRolar();

  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add("visto"); io.unobserve(e.target); }
  }), { threshold: 0.18 });
  document.querySelectorAll(".revelar").forEach((el) => io.observe(el));
  document.querySelectorAll("[data-ano]").forEach((el) => (el.textContent = new Date().getFullYear()));

  /* ── WhatsApp ─────────────────────────────────────────────────────────── */
  if (S.whatsapp) {
    const num = String(S.whatsapp.numero || "").replace(/\D/g, "");
    const url = `https://wa.me/${num}?text=${encodeURIComponent(S.whatsapp.mensagem || "")}`;
    document.querySelectorAll("[data-whats]").forEach((a) => {
      a.href = url; a.target = "_blank"; a.rel = "noopener";
    });
  }

  /* ── Formulário → e-mail ──────────────────────────────────────────────── */
  const form = document.querySelector(".form");
  if (form && S.contato) {
    const status = form.querySelector(".form-status");
    const botao = form.querySelector("button[type=submit]");
    const avisar = (txt, tipo) => { status.textContent = txt; status.className = `form-status campo--inteiro ${tipo || ""}`; };

    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      if (form.elements._honey.value) return; // robô
      let valido = true;
      form.querySelectorAll("[required]").forEach((c) => {
        const ok = c.type === "email" ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.value) : c.value.trim().length > 1;
        c.closest(".campo").classList.toggle("erro", !ok);
        if (!ok) valido = false;
      });
      if (!valido) return avisar("Confira os campos destacados.", "falha");

      const dados = Object.fromEntries(new FormData(form));
      delete dados._honey;
      const assunto = S.contato.assunto || `Novo contato pelo site ${S.nome || ""}`;
      let url, corpo;
      if (S.contato.web3formsChave) {
        url = "https://api.web3forms.com/submit";
        corpo = { access_key: S.contato.web3formsChave, subject: assunto, from_name: S.nome, ...dados };
      } else {
        url = `https://formsubmit.co/ajax/${encodeURIComponent(S.contato.email)}`;
        corpo = { _subject: assunto, _template: "table", _captcha: "false", ...dados };
      }

      botao.disabled = true;
      avisar("Enviando…");
      try {
        const r = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(corpo),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || j.success === false || j.success === "false") throw new Error(j.message || r.status);
        form.reset();
        avisar("Recebemos seu contato. Em breve falamos com você.", "ok");
      } catch (e) {
        console.warn("Falha no envio do formulário:", e);
        avisar("Não foi possível enviar agora. Chame a gente no WhatsApp.", "falha");
      } finally {
        botao.disabled = false;
      }
    });
  }
})();
