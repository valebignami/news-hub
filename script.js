const spreadsheetId = "1ei9LYzcVXOIWftKBZQi-428QV-OOhWRyN_Qoe2JkJyA";
const apiKey = "AIzaSyDd5eSJ4QrUroaEjIaoNvfg1zOwgOFR5CA";
const clientId = "592477464596-su34uong0q0cn5lq681o5rioukl3m5nu.apps.googleusercontent.com";
const scopes = "https://www.googleapis.com/auth/spreadsheets";

let tokenClient;
let gapiInited = false;
let gisInited = false;
let accessToken = null;

let posts = [];

let retryAttempts = 0;
const maxRetries = 3;

const blogContainer = document.getElementById("blog-container");
const loader = document.getElementById("loader");

let category = window.location.pathname.split("/").pop().split(".").shift();
if (category === "index") category = "Technology";

function gapiLoaded() {
  gapi.load("client", initializeGapiClient);
}

async function initializeGapiClient() {
  try {
    await gapi.client.init({
      apiKey: apiKey,
      discoveryDocs: [
        "https://sheets.googleapis.com/$discovery/rest?version=v4",
      ],
    });
    gapiInited = true;
    maybeEnableFeatures();
  } catch (err) {
    console.error("Error initializing GAPI client:", err);
    handleApiError(); 
  }
}

function gisLoaded() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: scopes,
    callback: (tokenResponse) => {
      if (tokenResponse.error !== undefined) {
        console.error("Error obtaining token:", tokenResponse.error);
        handleApiError(); 
        return;
      }

      accessToken = tokenResponse.access_token;

      localStorage.setItem("accessToken", accessToken);
      localStorage.setItem("tokenTimestamp", Date.now().toString());

      fetchPostsGAPI(category);
    },
  });
  gisInited = true;
  maybeEnableFeatures();
}

function handleApiError() {
  retryAttempts++;
  if (retryAttempts <= maxRetries) {
    console.log(`Retrying to load Google API... Attempt ${retryAttempts} of ${maxRetries}`);
    setTimeout(() => {
      gapiLoaded(); 
    }, 2000);
  } else {
    console.error("Failed to load Google API after several attempts. Reloading the page...");
    location.reload();
  }
}

function maybeEnableFeatures() {
  if (gapiInited && gisInited) {
    requestAccessTokenIfNeeded();
  }
}

function requestAccessTokenIfNeeded() {
  const storedToken = localStorage.getItem("accessToken");
  const tokenTimestamp = localStorage.getItem("tokenTimestamp");

  if (storedToken && tokenTimestamp) {
    const currentTime = Date.now();
    const elapsedTime = currentTime - parseInt(tokenTimestamp, 10);

    if (elapsedTime < 3600000) { 
      accessToken = storedToken;
      fetchPostsGAPI(category);
      return;
    }
  }

  tokenClient.requestAccessToken({ prompt: "" });
}

async function fetchPostsGAPI(category) {
  loader.style.display = "block";

  if (!category || category.toLowerCase() === "index") {
    category = "Technology";
  }

  const range = `${category}!A2:H`;

  try {
    if (accessToken) {
      gapi.client.setToken({ access_token: accessToken });
    }

    const response = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });

    const rows = response.result.values;
    if (!rows) {
      console.log("No data found.");
      loader.style.display = "none";
      return;
    }

    posts = rows.map((row) => ({
      uid: row[0],
      title: row[1],
      link: row[2],
      summary: row[3],
      rate: parseFloat(row[5]),
      category: row[6],
      starred: row[7] === "TRUE",
    }));

    displayPosts(posts);
  } catch (error) {
    console.error("Error fetching data:", error);
    loader.style.display = "none";
  }
}

function displayPosts(posts) {
  blogContainer.innerHTML = "";
  loader.style.display = "none";

  const sortedPosts = sortPosts(posts);

  sortedPosts.forEach((post) => {
    let starIcon = post.starred ? "icons/starred.png" : "icons/starred-not.png";
    let categoryIcon = `icons/${post.category}.png`;

    let card = `
      <div class="card">
        <div class="card-header">
            <h2>${post.title}</h2>
            <img class="star-icon" data-uid="${post.uid}" data-category="${post.category}" src="${starIcon}" alt="star">
        </div>
        <p class="summary">${post.summary}</p>
        <div class="card-footer">
            <a href="${post.link}" target="_blank">Read More</a>
            <div>
                <div class="rate">
                    <p>${post.rate}</p>
                </div>
                <img src="${categoryIcon}" alt="${post.category}">
            </div>
        </div>
      </div>
    `;
    blogContainer.innerHTML += card;
  });

  document.querySelectorAll(".star-icon").forEach((star) => {
    star.addEventListener("click", function () {
      const uid = this.dataset.uid;
      const category = this.dataset.category;
      toggleStar(this, uid, category);
    });
  });
}

function sortPosts(posts) {
  const starredPosts = posts.filter((p) => p.starred);
  const unstarredPosts = posts.filter((p) => !p.starred);

  starredPosts.sort((a, b) => b.rate - a.rate);
  unstarredPosts.sort((a, b) => b.rate - a.rate);

  return [...starredPosts, ...unstarredPosts];
}

async function toggleStar(starElement, uid, category) {
  if (!accessToken) {
    tokenClient.requestAccessToken({ prompt: "" });
    return;
  }

  gapi.client.setToken({ access_token: accessToken });

  const range = `${category}!A2:H`;
  try {
    const getResponse = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });
    const rows = getResponse.result.values;
    if (!rows) {
      console.error("No data found in toggle.");
      return;
    }

    let rowIndex = rows.findIndex((row) => row[0] === uid);
    if (rowIndex === -1) {
      console.error("UID not found in sheet.");
      return;
    }

    let currentStar = rows[rowIndex][7] || "FALSE"; 
    let newStarredValue = currentStar === "TRUE" ? false : true; 

    let updateRange = `${category}!H${rowIndex + 2}`;
    const body = {
      values: [[newStarredValue]], 
    };

    await gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId,
      range: updateRange,
      valueInputOption: "RAW", 
      resource: body,
    });
    console.log(`Row ${rowIndex + 2} updated to ${newStarredValue}`);

    starElement.src =
      newStarredValue === true ? "icons/starred.png" : "icons/starred-not.png";

    posts.forEach((post) => {
      if (post.uid === uid) {
        post.starred = newStarredValue;
      }
    });
    displayPosts(posts); 
  } catch (err) {
    console.error("Error toggling starred:", err);
  }
}


function navigate(category) {
  const pages = {
    technology: "index.html",
    financial: "financial.html",
    esg: "esg.html",
  };
  window.location.href = pages[category] || "index.html";
}

document.addEventListener("DOMContentLoaded", function () {
  const maxRetries = 10;  
  const retryDelay = 1000; 

  let retries = 0;

  function checkGoogleAPI() {
    if (typeof gapi === 'undefined' || typeof google === 'undefined') {
      if (retries < maxRetries) {
        console.log(`Google API not loaded, retrying... (${retries + 1}/${maxRetries})`);
        retries++;
        setTimeout(checkGoogleAPI, retryDelay);
      } else {
        console.error("Google API failed to load after multiple attempts.");
      }
    } else {
      gapiLoaded();
      gisLoaded();
    }
  }

  checkGoogleAPI();
});