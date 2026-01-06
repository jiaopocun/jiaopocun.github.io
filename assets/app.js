(() => {
  const body = document.body;
  if (!body) return;

  const page = body.dataset.page || "";
  const csvPath = body.dataset.csv || "data/图片信息.csv";
  const photosRoot = body.dataset.photosRoot || ".";
  const defaultSeries = body.dataset.defaultSeries || "默认系列";

  const cleanText = (value) => String(value || "").trim();

  const joinNonEmpty = (parts, separator = "｜") =>
    parts.map(cleanText).filter(Boolean).join(separator);

  const hasFileExt = (value) => /\.[a-zA-Z0-9]+$/.test(value);

  const joinPath = (...parts) =>
    parts
      .filter(Boolean)
      .map((part, index) =>
        index === 0
          ? part.replace(/\/+$/, "")
          : part.replace(/^\/+|\/+$/g, "")
      )
      .join("/");

  const parseCsv = (text) => {
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];

      if (inQuotes) {
        if (char === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i += 1;
          } else {
            inQuotes = false;
          }
        } else {
          field += char;
        }
        continue;
      }

      if (char === '"') {
        inQuotes = true;
        continue;
      }

      if (char === ",") {
        row.push(field);
        field = "";
        continue;
      }

      if (char === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
        continue;
      }

      if (char === "\r") {
        continue;
      }

      field += char;
    }

    if (field.length || row.length) {
      row.push(field);
      rows.push(row);
    }

    if (!rows.length) return [];

    const header = rows.shift().map((cell) => cell.replace(/^\uFEFF/, "").trim());

    return rows
      .map((cells) => {
        const rowData = {};
        header.forEach((key, idx) => {
          rowData[key] = String(cells[idx] || "").trim();
        });
        return rowData;
      })
      .filter((rowData) => Object.values(rowData).some((value) => value));
  };

  const fallbackSvg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">' +
    '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0%" stop-color="#f5e9d6"/><stop offset="100%" stop-color="#e4d1b8"/>' +
    '</linearGradient></defs>' +
    '<rect width="800" height="600" fill="url(#g)"/>' +
    '<g fill="#8b7a67" font-family="Noto Sans SC, sans-serif" font-size="28" text-anchor="middle">' +
    '<text x="400" y="300">图片加载失败</text>' +
    '</g></svg>';
  const fallbackImage = `data:image/svg+xml;utf8,${encodeURIComponent(fallbackSvg)}`;

  const getSeriesFromRow = (row, photoId) => {
    const raw = row.series || row.series_slug || row.album || "";
    const cleaned = String(raw || "").trim();
    if (cleaned) return cleaned;
    if (photoId && photoId.includes("/")) {
      return photoId.split("/")[0];
    }
    return defaultSeries;
  };

  const buildImagePath = (photoId, series) => {
    if (!photoId) return "";
    const trimmed = String(photoId).trim();

    if (trimmed.includes("/")) {
      const path = hasFileExt(trimmed) ? trimmed : `${trimmed}.jpg`;
      return joinPath(photosRoot, path);
    }

    const fileName = hasFileExt(trimmed) ? trimmed : `${trimmed}.jpg`;
    return joinPath(photosRoot, series, fileName);
  };

  const normalizePhotos = (rows) => {
    return rows
      .map((row) => {
        const rawId = row.photo_id || row.id || row.photo || row.photoId || "";
        const id = String(rawId || "").trim();
        if (!id) return null;
        const series = getSeriesFromRow(row, id);
        return {
          id,
          series,
          time: cleanText(row.time),
          place: cleanText(row.place),
          highlight: cleanText(row.highlight),
          source: cleanText(row.source),
          image: buildImagePath(id, series),
        };
      })
      .filter(Boolean);
  };

  const titleForPhoto = (photo) => joinNonEmpty([photo.time, photo.place, photo.highlight]);

  const pickFirst = (photos, key) => {
    for (const photo of photos) {
      const value = String(photo[key] || "").trim();
      if (value) return value;
    }
    return "";
  };

  const collator = new Intl.Collator("zh-Hans-CN", { numeric: true, sensitivity: "base" });

  const groupBySeries = (photos) => {
    const map = new Map();
    photos.forEach((photo) => {
      const key = photo.series || defaultSeries;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(photo);
    });
    return [...map.entries()].map(([key, items]) => {
      const sorted = items.slice().sort((a, b) => collator.compare(a.id, b.id));
      return { key, items: sorted };
    });
  };

  const showError = (message) => {
    const errorEl = document.querySelector("[data-error]");
    if (!errorEl) return;
    errorEl.hidden = false;
    errorEl.textContent = message;
  };

  const renderIndex = (photos) => {
    const list = document.querySelector("[data-series-list]");
    const empty = document.querySelector("[data-empty]");
    const primaryLink = document.querySelector("[data-primary-link]");
    if (!list) return;

    const groups = groupBySeries(photos);
    if (!groups.length) {
      if (empty) empty.hidden = false;
      if (primaryLink) primaryLink.hidden = true;
      return;
    }

    if (primaryLink) primaryLink.hidden = false;

    groups.forEach((group, index) => {
      const count = group.items.length;
      const cover = group.items[0];
      const timeHint = pickFirst(group.items, "time");
      const placeHint = pickFirst(group.items, "place");
      const metaLines = [`<span>共 ${count} 张</span>`];
      if (timeHint) metaLines.push(`<span>时间 ${timeHint}</span>`);
      if (placeHint) metaLines.push(`<span>地点 ${placeHint}</span>`);

      const card = document.createElement("a");
      card.className = "card";
      card.href = `series.html?s=${encodeURIComponent(group.key)}`;
      card.style.setProperty("--delay", `${index * 80}ms`);

      card.innerHTML = `
        <div class="card-media">
          <img src="${encodeURI(cover.image)}" alt="${group.key}" loading="lazy" />
        </div>
        <div class="card-body">
          <h3>${group.key}</h3>
          <div class="meta">
            ${metaLines.join("")}
          </div>
          <div class="tag-row">
            <span class="tag">照片档案</span>
            <span class="tag">点击进入</span>
          </div>
        </div>
      `;

      const img = card.querySelector("img");
      if (img) {
        img.addEventListener("error", () => {
          img.src = fallbackImage;
        });
      }

      list.appendChild(card);

      if (primaryLink && index === 0) {
        primaryLink.setAttribute("href", card.href);
      }
    });
  };

  const renderSeries = (photos) => {
    const grid = document.querySelector("[data-photo-grid]");
    const empty = document.querySelector("[data-empty]");
    const titleEl = document.querySelector("#series-title");
    const metaEl = document.querySelector("#series-meta");

    if (!grid) return;

    const params = new URLSearchParams(window.location.search);
    const seriesKey = params.get("s") || defaultSeries;

    const filtered = photos.filter((photo) => photo.series === seriesKey);

    if (!filtered.length) {
      if (empty) empty.hidden = false;
      if (titleEl) titleEl.textContent = "内容整理中";
      if (metaEl) metaEl.textContent = "";
      return;
    }

    if (titleEl) titleEl.textContent = seriesKey;
    const timeHint = pickFirst(filtered, "time");
    const placeHint = pickFirst(filtered, "place");
    if (metaEl) {
      const parts = [`共 ${filtered.length} 张`];
      if (timeHint) parts.push(`时间 ${timeHint}`);
      if (placeHint) parts.push(`地点 ${placeHint}`);
      metaEl.textContent = parts.join(" · ");
    }

    filtered.forEach((photo, index) => {
      const card = document.createElement("a");
      card.className = "photo-card";
      card.href = `photo.html?s=${encodeURIComponent(seriesKey)}&id=${encodeURIComponent(photo.id)}`;
      card.style.setProperty("--delay", `${index * 30}ms`);

      const caption = titleForPhoto(photo);
      const altText = caption || photo.id;
      card.innerHTML = `
        <img src="${encodeURI(photo.image)}" alt="${altText}" loading="lazy" />
        ${caption ? `<div class="caption">${caption}</div>` : ""}
      `;

      const img = card.querySelector("img");
      if (img) {
        img.addEventListener("error", () => {
          img.src = fallbackImage;
        });
      }

      grid.appendChild(card);
    });
  };

  const renderPhoto = (photos) => {
    const params = new URLSearchParams(window.location.search);
    const seriesKey = params.get("s") || defaultSeries;
    const targetId = params.get("id") || "";

    const list = photos
      .filter((photo) => photo.series === seriesKey)
      .sort((a, b) => collator.compare(a.id, b.id));

    const index = list.findIndex((photo) => photo.id === targetId);
    const photo = index >= 0 ? list[index] : null;

    if (!photo) {
      showError("未找到该照片，请检查链接或 CSV 数据。");
      return;
    }

    const img = document.querySelector("#photo-image");
    const title = document.querySelector("#photo-title");
    const time = document.querySelector("#photo-time");
    const place = document.querySelector("#photo-place");
    const highlight = document.querySelector("#photo-highlight");
    const source = document.querySelector("#photo-source");
    const backLink = document.querySelector("#back-to-series");

    const caption = titleForPhoto(photo);
    if (img) {
      img.src = encodeURI(photo.image);
      img.alt = caption || photo.id;
      img.addEventListener("error", () => {
        img.src = fallbackImage;
      });
    }
    if (title && caption) title.textContent = caption;

    const setInfoRow = (el, value) => {
      if (!el) return;
      const text = cleanText(value);
      const wrapper = el.closest("div");
      if (!text) {
        if (wrapper) wrapper.remove();
        return;
      }
      el.textContent = text;
    };

    setInfoRow(time, photo.time);
    setInfoRow(place, photo.place);
    setInfoRow(highlight, photo.highlight);
    setInfoRow(source, photo.source);

    if (backLink) {
      backLink.href = `series.html?s=${encodeURIComponent(seriesKey)}`;
    }

    const prev = document.querySelector("#prev-photo");
    const next = document.querySelector("#next-photo");

    if (prev) {
      if (index > 0) {
        prev.href = `photo.html?s=${encodeURIComponent(seriesKey)}&id=${encodeURIComponent(list[index - 1].id)}`;
        prev.removeAttribute("aria-disabled");
      } else {
        prev.href = "#";
        prev.setAttribute("aria-disabled", "true");
      }
    }

    if (next) {
      if (index < list.length - 1) {
        next.href = `photo.html?s=${encodeURIComponent(seriesKey)}&id=${encodeURIComponent(list[index + 1].id)}`;
        next.removeAttribute("aria-disabled");
      } else {
        next.href = "#";
        next.setAttribute("aria-disabled", "true");
      }
    }
  };

  const start = async () => {
    try {
      const response = await fetch(encodeURI(csvPath), { cache: "no-store" });
      if (!response.ok) {
        throw new Error("CSV 加载失败，请检查 data 路径或权限。");
      }
      const text = await response.text();
      const rows = parseCsv(text);
      const photos = normalizePhotos(rows);

      if (page === "index") {
        renderIndex(photos);
      } else if (page === "series") {
        renderSeries(photos);
      } else if (page === "photo") {
        renderPhoto(photos);
      }
    } catch (error) {
      showError(error.message || "CSV 加载失败，请稍后再试。");
    }
  };

  start();
})();
