// Format dates to MM/DD/YY
function formatDate(dateStr, hasYear = false) {
  const months = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
  };

  const parts = dateStr.toLowerCase().split(' ');
  const day = parseInt(parts[0]);
  const month = months[parts[1]];
  const year = hasYear
    ? parseInt(parts[2])
    : new Date().getFullYear();

  if (!day || isNaN(month)) return "Invalid date";

  const d = new Date(year, month, day);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);

  return `${mm}/${dd}/${yy}`;
}

// Format number with comma and 2 decimal places
function formatAmount(value) {
  const num = parseFloat(value.toString().replace(/,/g, ''));
  if (isNaN(num)) return value;
  return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Upload information to Google Sheet
function uploadToGoogleSheet(date, store, total, platform) {
  const uploadBtn = document.getElementById('uploadBtn');
  const cloned = uploadBtn.cloneNode(true);
  uploadBtn.parentNode.replaceChild(cloned, uploadBtn);

  cloned.addEventListener('click', () => {
    cloned.disabled = true;
    cloned.textContent = "Uploading...";

    fetch('https://script.google.com/macros/s/AKfycbzU7AAW3u7xLOqPtQTy1itnHGA2OMSLQ_ubIuGufOORsiUKlDukVzhx2ePNR-sR7jhQhg/exec', {
      method: 'POST',
      mode: 'no-cors',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ date, store, total, platform })
    })
    .then(() => {
      cloned.textContent = "Uploaded to Google Sheet!";
    })
    .catch(err => {
      console.error("Upload failed:", err);
      cloned.disabled = false;
      cloned.textContent = "Upload to Google Sheet";
      alert("Upload failed. Please try again.");
    });
  });
}

function setupEditAndUpload(date, store, total, platform) {
  document.getElementById('editBtn').addEventListener('click', () => {
    const card = document.getElementById('detailsCard');
    card.innerHTML = `
      <h2>Edit Order Details</h2>
      <p><strong>Store:</strong> <input type="text" id="storeInput" value="${store}" /></p>
      <p><strong>Date:</strong> <input type="text" id="dateInput" value="${date}" /></p>
      <p><strong>Total:</strong> <input type="text" id="totalInput" value="${total}" /></p>
      <button id="saveBtn">Save</button>
    `;

    document.getElementById('saveBtn').addEventListener('click', () => {
      store = document.getElementById('storeInput').value;
      date = document.getElementById('dateInput').value;
      total = formatAmount(document.getElementById('totalInput').value);

      card.innerHTML = `
        <h2>Order Details</h2>
        <p><strong>Store:</strong> <span id="storeText">${store}</span></p>
        <p><strong>Date:</strong> <span id="dateText">${date}</span></p>
        <p><strong>Total Amount:</strong> <span id="totalText">${total}</span></p>
        <button id="editBtn">Edit</button>
        <button id="uploadBtn">Upload to Google Sheet</button>
      `;

      setupEditAndUpload(date, store, total, platform);
      uploadToGoogleSheet(date, store, total, platform);
    });
  });

  uploadToGoogleSheet(date, store, total, platform);
}

document.getElementById('processBtn').addEventListener('click', async () => {
  const input = document.getElementById('imageInput');
  const loading = document.getElementById('loading');
  const output = document.getElementById('output');
  const uploadedImageCard = document.getElementById('uploadedImageCard');

  if (!input.files.length) return alert('Please upload an image');

  output.classList.add('hidden');
  output.textContent = '';
  uploadedImageCard.classList.add("hidden");
  uploadedImageCard.innerHTML = '';

  loading.classList.remove('hidden');

  const image = input.files[0];

  const { data: { text } } = await Tesseract.recognize(
    image,
    'eng',
    { logger: m => console.log(m) }
  );

  loading.classList.add('hidden');
  output.classList.remove('hidden');
  uploadedImageCard.classList.remove('hidden');

  const cleanedText = text.replace(/\s+/g, ' ').toLowerCase();
  let store = "Unknown store";
  let date = "Unknown date";
  let total = "Unknown amount";
  let platform = "Unknown platform";

  // --- Foodpanda ---
  if (cleanedText.includes("order from") && cleanedText.includes("delivered on")) {
    platform = "FoodPanda"
    const flatText = text.replace(/\n/g, ' ');
    const storeMatch = flatText.match(/order from (.+?) delivered to/i);
    if (storeMatch && storeMatch[1]) {
      store = storeMatch[1]
        .replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9\s\-&]+$/g, '')
        .trim();
    }

    const dateMatch = flatText.match(/delivered on (\d{1,2} \w{3})/i);
    if (dateMatch && dateMatch[1]) {
      date = formatDate(dateMatch[1], false);
    }

    const totalMatches = [...text.matchAll(/(?:total|paid with)[^\d]*(\d+[.,]?\d{0,2})/gi)];
    if (totalMatches.length > 0) {
      const lastMatch = totalMatches[totalMatches.length - 1];
      if (lastMatch[1]) total = formatAmount(lastMatch[1]);
    }
  }

  // --- Grab ---
  else if (cleanedText.includes("booking id") && cleanedText.includes("total")) {
    platform = "Grab Food"
    const lines = text.split('\n').map(l => l.trim());
    const bookingIndex = lines.findIndex(l => l.toLowerCase().includes("booking id"));
    if (bookingIndex >= 0) {
      for (let i = bookingIndex + 1; i <= bookingIndex + 3 && i < lines.length; i++) {
        const possibleStore = lines[i];
        if (possibleStore && possibleStore.includes(" - ")) {
          store = possibleStore
            .split(/rate|view|order|delivered|details/i)[0]
            .replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9\s\-&()]+$/g, '')
            .trim();
          break;
        }
      }
    }

    const dateMatch = text.match(/(\d{1,2} \w{3} 202\d)/);
    if (dateMatch && dateMatch[1]) {
      date = formatDate(dateMatch[1], true);
    }

    const allMatches = [...text.matchAll(/[₱£p]\s?([\d,.]+)/gi)];
    if (allMatches.length > 0) {
      const lastMatch = allMatches[allMatches.length - 1];
      if (lastMatch[1]) total = formatAmount(lastMatch[1]);
    }
  }

  output.innerHTML = `
    <div class="result-card" id="detailsCard">
      <h2>Order Details</h2>
      <p><strong>Store:</strong> <span id="storeText">${store}</span></p>
      <p><strong>Date:</strong> <span id="dateText">${date}</span></p>
      <p><strong>Total Amount:</strong> <span id="totalText">${total}</span></p>
      <button id="editBtn">Edit</button>
      <button id="uploadBtn">Upload to Google Sheet</button>
    </div>
  `;

  uploadedImageCard.innerHTML = `
    <div class="result-card">
      <h2>Uploaded Receipt</h2>
      <img src="${URL.createObjectURL(image)}" alt="Uploaded Image" style="max-width: 100%; border-radius: 6px; margin-top: 0.5rem;" />
    </div>
  `;

  setupEditAndUpload(date, store, total, platform);
});