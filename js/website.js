/**
 * Website tab: uploads the weekly ad and holiday menus. PDF pages are rendered to
 * JPEG with pdf.js, photos are resized, and files go to the Supabase "flyers" bucket.
 */
"use strict";

const THEMES = {
  thanksgiving: "Thanksgiving",
  christmas: "Christmas",
  easter: "Easter",
  summer: "Summer / July 4th",
  general: "Other holiday"
};

const MAX_PICTURE_WIDTH = 1600;   // pixels: sharp on any screen, still a small file

async function showWebsite() {
  const flyers = await Store.listFlyers();
  const today = dateValue(new Date());
  const isShowing = function (f) {
    return (!f.starts_on || f.starts_on <= today) && (!f.ends_on || f.ends_on >= today);
  };
  // The website shows the newest flyer of each kind that's in its dates
  const liveWeekly = flyers.find(function (f) { return f.kind === "weekly" && isShowing(f); });
  const liveHoliday = flyers.find(function (f) { return f.kind === "holiday" && isShowing(f); });

  function flyerCard(f) {
    const live = f === liveWeekly || f === liveHoliday;
    const state = live ? '<span class="status status-completed">On the website now</span>'
      : (f.starts_on && f.starts_on > today ? '<span class="status status-new">Starts ' + esc(niceDate(f.starts_on)) + "</span>"
      : (isShowing(f) ? '<span class="status">Replaced by a newer one</span>' : '<span class="status status-cancelled">Ended</span>'));
    return (
      '<li class="card flyer-card">' +
        (f.pages && f.pages[0] ? '<a href="' + esc(f.pages[0]) + '" target="_blank" rel="noopener"><img src="' + esc(f.pages[0]) + '" alt="" loading="lazy"></a>' : "") +
        '<div class="flyer-info">' +
          "<strong>" + esc(f.title) + "</strong>" + (f.kind === "holiday" ? " · " + esc(THEMES[f.theme] || "") : "") + "<br>" +
          "<small>" + esc(dateRange(f)) + " · " + (f.pages || []).length + " page" + ((f.pages || []).length === 1 ? "" : "s") + "</small><br>" +
          state +
          // Weekly ads: the headline deals shown big on the homepage, editable any time
          (f.kind === "weekly"
            ? '<details class="headline-edit"><summary>Homepage deals: ' + esc(dealsSummary(f)) + "</summary>" +
                // Deal pictures (shown on the homepage instead of the text lines)
                ((f.deal_images || []).length
                  ? '<div class="deal-thumbs">' + f.deal_images.map(function (url) {
                      return '<img src="' + esc(url) + '" alt="">';
                    }).join("") + "</div>" +
                    '<button type="button" class="link-btn danger" data-action="remove-deal-images" data-id="' + f.id + '">Remove deal pictures</button>'
                  : "") +
                '<label class="small-label">Add deal pictures<input type="file" accept="image/*" multiple id="deal-files-' + f.id + '"></label>' +
                '<button type="button" class="btn btn-small" data-action="add-deal-images" data-id="' + f.id + '">Upload pictures</button>' +
                '<label class="small-label">Deal lines <small>(used when there are no pictures, and read aloud for blind visitors)</small>' +
                  '<textarea rows="3" id="headline-' + f.id + '">' + esc(f.headline || "") + "</textarea></label>" +
                '<button type="button" class="btn btn-small" data-action="save-headline" data-id="' + f.id + '">Save deal lines</button>' +
              "</details>"
            : "") +
          // Holiday menus: the on/off switch for the big holiday section on the homepage
          (f.kind === "holiday"
            ? '<label class="feature-switch"><input type="checkbox" data-action="toggle-featured" data-id="' + f.id + '"' +
                (f.featured !== false ? " checked" : "") + "> Feature on homepage</label>"
            : "") +
          '<button type="button" class="link-btn danger" data-action="delete-flyer" data-id="' + f.id + '">Delete</button>' +
        "</div>" +
      "</li>"
    );
  }

  const weekly = flyers.filter(function (f) { return f.kind === "weekly"; });
  const holiday = flyers.filter(function (f) { return f.kind === "holiday"; });

  view.innerHTML =
    '<div class="screen-head"><h1>Website</h1></div>' +
    '<p class="muted">Upload the weekly ad or a holiday menu as a <strong>PDF or pictures</strong>. It shows on the website right away (within a minute).</p>' +

    // ---- WEEKLY SALES ----
    '<section class="panel"><h2>' + icon("tag") + ' Weekly sales ad</h2>' +
      '<form class="stack" id="weekly-form" novalidate>' +
        '<label>PDF or pictures of the ad<input name="files" type="file" accept="application/pdf,image/*" multiple required></label>' +
        '<div class="two-col">' +
          '<label>First day<input name="starts_on" type="date" value="' + today + '"></label>' +
          '<label>Last day<input name="ends_on" type="date" value="' + dateValue(addDays(new Date(), 6)) + '"></label>' +
        "</div>" +
        '<label>Headline deals for the homepage <small>(optional, 1 to 3 lines)</small>' +
          '<textarea name="headline" rows="3" placeholder="FREE whole turkey with $250 purchase&#10;FREE 40-pack of water with $125 purchase"></textarea></label>' +
        '<p class="hint">The best offers, one per line. They show in big letters on the homepage while this ad is up.</p>' +
        '<label>Deal pictures for the homepage <small>(optional, up to 4)</small>' +
          '<input name="deal_files" type="file" accept="image/*" multiple></label>' +
        '<p class="hint">Pictures of the best deals cut from the ad (like the free turkey). They show on the homepage instead of the lines above.</p>' +
        '<p class="error" id="weekly-error" role="alert" hidden></p>' +
        '<button class="btn btn-primary btn-block" type="submit">Upload weekly ad</button>' +
      "</form>" +
      (weekly.length ? '<ul class="card-list flyer-list">' + weekly.map(flyerCard).join("") + "</ul>" : '<p class="muted">No weekly ads uploaded yet. The website links to the Key Food ad instead.</p>') +
    "</section>" +

    // ---- HOLIDAY MENU ----
    '<section class="panel"><h2>' + icon("calendar") + ' Holiday menu</h2>' +
      '<form class="stack" id="holiday-form" novalidate>' +
        '<label>Title<input name="title" value="Thanksgiving Dinner" required></label>' +
        '<label>Look of the page<select name="theme">' +
          Object.keys(THEMES).map(function (k) { return '<option value="' + k + '">' + THEMES[k] + "</option>"; }).join("") +
        "</select></label>" +
        '<label>PDF or pictures of the menu<input name="files" type="file" accept="application/pdf,image/*" multiple required></label>' +
        '<label>Note for customers <small>(optional)</small><textarea name="note" rows="2" placeholder="Order by Monday, Nov 23. Pick up Wed or Thu."></textarea></label>' +
        '<div class="two-col">' +
          '<label>Show from<input name="starts_on" type="date" value="' + today + '"></label>' +
          '<label>Show until<input name="ends_on" type="date"></label>' +
        "</div>" +
        '<label class="feature-switch"><input type="checkbox" name="featured" checked> Feature on homepage <small>(big holiday section under the store photo)</small></label>' +
        '<p class="error" id="holiday-error" role="alert" hidden></p>' +
        '<button class="btn btn-primary btn-block" type="submit">Upload holiday menu</button>' +
      "</form>" +
      (holiday.length ? '<ul class="card-list flyer-list">' + holiday.map(flyerCard).join("") + "</ul>" : '<p class="muted">No holiday menus yet. The website hides the holiday page until there is one.</p>') +
    "</section>";

  view.onclick = async function (event) {
    // Deal pictures: upload more, or remove them all
    const dealButton = event.target.closest('[data-action="add-deal-images"], [data-action="remove-deal-images"]');
    if (dealButton) {
      const flyer = flyers.find(function (f) { return f.id === Number(dealButton.dataset.id); });
      const label = dealButton.textContent;
      dealButton.disabled = true;
      try {
        if (dealButton.dataset.action === "add-deal-images") {
          const files = Array.from(document.getElementById("deal-files-" + flyer.id).files);
          if (!files.length) throw new Error("Choose one or more pictures first.");
          await addDealImages(flyer, files, function (message) { dealButton.textContent = message; });
          toast("Deal pictures uploaded");
        } else {
          if (!confirm("Remove the deal pictures from the homepage?")) return;
          await Store.removeFlyerFiles(flyer.deal_images || []);
          await Store.updateFlyer(flyer.id, { deal_images: [] });
          toast("Deal pictures removed");
        }
        route();
      } catch (error) {
        showError(error);
      } finally {
        dealButton.disabled = false;
        dealButton.textContent = label;
      }
      return;
    }
    const save = event.target.closest('[data-action="save-headline"]');
    if (save) {
      try {
        const id = Number(save.dataset.id);
        await Store.updateFlyer(id, { headline: cleanHeadline(document.getElementById("headline-" + id).value) });
        toast("Homepage deals saved");
        route();
      } catch (error) {
        showError(error);
      }
      return;
    }
    const button = event.target.closest('[data-action="delete-flyer"]');
    if (!button) return;
    const flyer = flyers.find(function (f) { return f.id === Number(button.dataset.id); });
    if (!confirm('Delete "' + flyer.title + '" (' + dateRange(flyer) + ")? It comes off the website.")) return;
    try {
      await Store.deleteFlyer(flyer);
      toast("Deleted");
      route();
    } catch (error) {
      showError(error);
    }
  };
  view.oninput = null;
  view.onchange = async function (event) {
    // "Feature on homepage" switch on a holiday menu: saves right away
    if (event.target.dataset.action === "toggle-featured") {
      const box = event.target;
      try {
        await Store.updateFlyer(Number(box.dataset.id), { featured: box.checked });
        toast(box.checked ? "Now featured on the homepage" : "Removed from the homepage");
      } catch (error) {
        box.checked = !box.checked;   // saving failed: put the switch back
        showError(error);
      }
      return;
    }
    // Picking a look fills in a matching title (if the title hasn't been typed yet)
    if (event.target.name === "theme") {
      const titles = { thanksgiving: "Thanksgiving Dinner", christmas: "Christmas Dinner", easter: "Easter Dinner", summer: "Summer Cookout", general: "Holiday Menu" };
      const title = event.target.form.elements.title;
      if (Object.values(titles).indexOf(title.value) >= 0 || !title.value.trim()) title.value = titles[event.target.value];
    }
  };
  view.onsubmit = async function (event) {
    event.preventDefault();
    const form = event.target;
    const kind = form.id === "weekly-form" ? "weekly" : "holiday";
    const errorBox = document.getElementById(kind + "-error");
    const button = form.querySelector('button[type="submit"]');
    const buttonText = button.textContent;
    errorBox.hidden = true;
    try {
      const files = Array.from(form.elements.files.files);
      if (!files.length) throw new Error("Choose a PDF or at least one picture.");
      if (form.elements.ends_on.value && form.elements.starts_on.value && form.elements.ends_on.value < form.elements.starts_on.value) {
        throw new Error("The last day is before the first day.");
      }
      button.disabled = true;
      const flyer = await uploadFlyer(files, {
        kind: kind,
        title: kind === "weekly" ? "Weekly Sales" : form.elements.title.value.trim() || "Holiday Menu",
        theme: kind === "weekly" ? "general" : form.elements.theme.value,
        note: kind === "holiday" ? (form.elements.note.value.trim() || null) : null,
        headline: kind === "weekly" ? cleanHeadline(form.elements.headline.value) : null,
        featured: kind === "holiday" ? form.elements.featured.checked : true,
        starts_on: form.elements.starts_on.value || null,
        ends_on: form.elements.ends_on.value || null
      }, function (message) { button.textContent = message; });
      // Weekly ad: deal pictures picked at the same time
      const dealFiles = kind === "weekly" ? Array.from(form.elements.deal_files.files) : [];
      if (dealFiles.length) await addDealImages(flyer, dealFiles, function (message) { button.textContent = message; });
      toast('"' + flyer.title + '" uploaded');
      route();
    } catch (error) {
      errorBox.textContent = error.message || String(error);
      errorBox.hidden = false;
    } finally {
      button.disabled = false;
      button.textContent = buttonText;
    }
  };
}

// "2 pictures · 2 lines", "none"...
function dealsSummary(f) {
  const pics = (f.deal_images || []).length;
  const lines = f.headline ? f.headline.split("\n").length : 0;
  const parts = [];
  if (pics) parts.push(pics + (pics === 1 ? " picture" : " pictures"));
  if (lines) parts.push(lines + (lines === 1 ? " line" : " lines"));
  return parts.length ? parts.join(" · ") : "none";
}

const MAX_DEAL_IMAGES = 4;
async function addDealImages(flyer, files, progress) {
  const current = flyer.deal_images || [];
  files.forEach(function (file) {
    if (file.type.indexOf("image/") !== 0) throw new Error(file.name + " is not a picture.");
  });
  if (current.length + files.length > MAX_DEAL_IMAGES) {
    throw new Error("Up to " + MAX_DEAL_IMAGES + " deal pictures. This ad already has " + current.length + ".");
  }
  const folder = "weekly/" + dateValue(new Date()) + "-deals-" + Math.random().toString(36).slice(2, 8);
  const urls = [];
  for (let i = 0; i < files.length; i++) {
    progress("Uploading deal picture " + (i + 1) + " of " + files.length + "…");
    const picture = await shrinkPicture(files[i]);
    urls.push((await Store.uploadFlyerFile(folder + "/deal-" + (i + 1) + ".jpg", picture)).url);
  }
  return Store.updateFlyer(flyer.id, { deal_images: current.concat(urls) });
}

// Headline deals: trim each line, drop empty ones, keep at most 3 short lines
function cleanHeadline(text) {
  const lines = String(text || "").split("\n")
    .map(function (line) { return line.trim().slice(0, 80); })
    .filter(Boolean)
    .slice(0, 3);
  return lines.length ? lines.join("\n") : null;
}

// "2026-11-26" -> "Thu, Nov 26"
function niceDate(text) {
  return new Date(text + "T12:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function dateRange(f) {
  if (f.starts_on && f.ends_on) return niceDate(f.starts_on) + " – " + niceDate(f.ends_on);
  if (f.starts_on) return "From " + niceDate(f.starts_on);
  if (f.ends_on) return "Until " + niceDate(f.ends_on);
  return "No end date";
}

async function uploadFlyer(files, details, progress) {
  const folder = details.kind + "/" + dateValue(new Date()) + "-" + Math.random().toString(36).slice(2, 8);
  const pictures = [];
  let pdfUrl = null;

  for (const file of files) {
    if (file.type === "application/pdf") {
      progress("Reading PDF…");
      const pages = await pdfToPictures(file, progress);
      pictures.push.apply(pictures, pages);
      progress("Uploading PDF…");
      if (!pdfUrl) pdfUrl = (await Store.uploadFlyerFile(folder + "/original.pdf", file)).url;
    } else if (file.type.indexOf("image/") === 0) {
      progress("Preparing pictures…");
      pictures.push(await shrinkPicture(file));
    } else {
      throw new Error(file.name + " is not a PDF or a picture.");
    }
  }
  if (pictures.length > 20) throw new Error("That's " + pictures.length + " pages. Please upload 20 or fewer.");

  const urls = [];
  for (let i = 0; i < pictures.length; i++) {
    progress("Uploading page " + (i + 1) + " of " + pictures.length + "…");
    urls.push((await Store.uploadFlyerFile(folder + "/page-" + (i + 1) + ".jpg", pictures[i])).url);
  }

  progress("Saving…");
  return Store.createFlyer(Object.assign({}, details, { pages: urls, pdf_url: pdfUrl }));
}

// Loads pdf.js only the first time it's needed (it's big, and most screens don't use it)
let pdfjsReady = null;
function loadPdfJs() {
  if (!pdfjsReady) {
    pdfjsReady = new Promise(function (resolve, reject) {
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
      script.onload = function () {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
        resolve(window.pdfjsLib);
      };
      script.onerror = function () { pdfjsReady = null; reject(new Error("Couldn't load the PDF reader. Check the internet and try again.")); };
      document.head.appendChild(script);
    });
  }
  return pdfjsReady;
}

// Each PDF page -> a JPEG picture, MAX_PICTURE_WIDTH pixels wide
async function pdfToPictures(file, progress) {
  const pdfjs = await loadPdfJs();
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  if (pdf.numPages > 20) throw new Error("That PDF has " + pdf.numPages + " pages. Please upload 20 or fewer.");
  const pictures = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    progress("Reading PDF page " + n + " of " + pdf.numPages + "…");
    const page = await pdf.getPage(n);
    const scale = MAX_PICTURE_WIDTH / page.getViewport({ scale: 1 }).width;
    const viewport = page.getViewport({ scale: scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";                       // white paper behind see-through parts
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: viewport }).promise;
    pictures.push(await canvasToJpeg(canvas));
  }
  return pictures;
}

// Phone photos can be 4000+ pixels wide and several MB: shrink to MAX_PICTURE_WIDTH
async function shrinkPicture(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise(function (resolve, reject) {
      const image = new Image();
      image.onload = function () { resolve(image); };
      image.onerror = function () { reject(new Error("Couldn't open " + file.name + ". Try a JPG or PNG.")); };
      image.src = url;
    });
    const scale = Math.min(1, MAX_PICTURE_WIDTH / img.naturalWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await canvasToJpeg(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function canvasToJpeg(canvas) {
  return new Promise(function (resolve, reject) {
    canvas.toBlob(function (blob) {
      if (blob) resolve(new File([blob], "page.jpg", { type: "image/jpeg" }));
      else reject(new Error("Couldn't make the picture."));
    }, "image/jpeg", 0.85);
  });
}
