const isLocal = () => window.location.hostname === 'localhost'
// const url = 'https://corsproxy.io/?' + encodeURIComponent('https://mspmag.com/promotions/restaurantweek')
const proxy = !isLocal() ? '/proxy/mspmag.com/' : 'https://corsproxy.io/?'
// const canonical = `https://mspmag.com/promotions/restaurantweek/restaurant-week-${new Date().getFullYear()}/`
const canonical = `https://mspmag.com/promotions/restaurantweek/Fall%20Restaurant%20Week%202024/`
const url = !isLocal() ? canonical.replace(/^https:\/\/mspmag.com\//, '') : encodeURIComponent(canonical)
const $app = document.getElementById('app')
const $template = document.getElementById('template')

function handleError(e) {
  $app.innerHTML = `<p>Error: ${e.toString()} <br><br> Try again or visit the direct link: <a href="${canonical}" target="_blank" rel="noopener noreferrer">${canonical}</a></p>`
}

async function getAPI() {
  const res = await fetch(proxy + url)
  const html = await res.text()
  try {
    const parser = new DOMParser()
    const $dom = parser.parseFromString(html, 'text/html')
    const $title = $dom.querySelector('#title > h1')
    const $img = $dom.querySelector('.mp-cover-img > figure > img')
    const $scripts = Array.from($dom.querySelectorAll('script'))
    const $script = $scripts.filter($script => $script.innerHTML.trim().startsWith('var _mp_require = {')).pop()
    const json = JSON.parse($script.innerHTML.trim().replace(/^var _mp_require =/, '').replace(/;$/, ''))
    const url = !isLocal() ? json['config']['js/page_roundup_location']['locations_url'].replace(/^https:\/\/mspmag.com\//, '') : json['config']['js/page_roundup_location']['locations_url']
    return Promise.resolve({
      api: url,
      header: {
        title: $title.innerHTML,
        img: {
          src: $img.src.replace(/\?.*$/, ''),
          alt: $img.alt
        }
      }
    })
  } catch (e) {
    throw e
  }
}

async function getRestaurants(api) {
  let data = []
  while (true) {
    const res = await fetch(proxy + api)
    const json = await res.json()
    data = data.concat(json.results)
    if (!json.more) break
    api = api.replace(/\?.*$/, `?page=${parseInt(json.page) + 1}`)
  }
  return data
}

async function formatRestaurants(restaurants) {
  return Promise.all(restaurants.map(async (restaurant, index) => {
    const parser = new DOMParser()
    const $html = parser.parseFromString(restaurant.html, 'text/html');
    const [html, menu_] = formatRestaurantHTML($html)
    const menu = await getMenu(menu_).catch(handleError)
    return {
      ...restaurant,
      html,
      menu,
      slug: `${slugify(restaurant.title)}-${index}`
    }
  }))
}

function formatRestaurantHTML($html) {
  $html.querySelectorAll('a[name]').forEach($el => $el.remove())
  $html.querySelectorAll('.number').forEach($el => $el.remove())
  $html.querySelectorAll('[itemprop=name]').forEach($el => $el.remove())
  $html.querySelectorAll('img').forEach($img => {
    $img.srcset = ''
    // Only strip the width query param (avoids a HTTP 302)
    $img.src = $img.src.replace(/&w=.*$/, '')
    $img.removeAttribute('width')
    $img.removeAttribute('height')

    // Attempt to preload the images
    const img = new Image()
    img.src = $img.src
    isLocal() && console.log('Preloading image', img.src)
  })
  $html.querySelectorAll('a[href^=http]').forEach($a => {
    $a.target = '_blank'
    $a.rel = 'noopener noreferrer'
  })
  $html.querySelectorAll('.info a').forEach($a => {
    $a.classList.add('button')
  })
  const menu = Array.from($html.querySelectorAll('a')).find($a => $a.textContent.toLowerCase().trim() === 'menu')
  return [$html.querySelector('li').innerHTML, menu !== undefined ? (!isLocal() ? menu.href.replace(/^https:\/\/mspmag.com\//, '') : menu.href) : null]
}

async function getMenu(api) {
  if (api === null)
    return Promise.resolve(`Found no menu, is restaurant week over? Check directly: <a href="${canonical}" target="_blank" rel="noopener noreferrer">${canonical}</a>`)
  const res = await fetch(proxy + api)
  const html = await res.text()
  const parser = new DOMParser()
  const $html = parser.parseFromString(html, 'text/html')
  return Promise.resolve(formatMenuHTML($html))
}

function formatMenuHTML($html) {
  return $html.querySelector('.content').innerHTML
}

// Thanks CodePen:
// https://blog.codepen.io/2016/11/17/anchor-links-post-headers/
function slugify(text) {
  return text.toString().toLowerCase().trim()
    .replace(/\s+/g, '-')     // Replace spaces with -
    .replace(/&/g, '-and-')   // Replace & with 'and'
    .replace(/[^\w\-]+/g, '') // Remove all non-word chars
    .replace(/\-\-+/g, '-');  // Replace multiple - with single -
}

function openMenuByHash() {
  if (!window.location.hash.endsWith(':menu')) return
  const $details = document.getElementById(window.location.hash.replace(/^#/, ''))
  if (!$details) return
  if (!$details.open) $details.open = true
}

(async () => {
  const {api, header} = await getAPI().catch(handleError)
  const restaurants = await getRestaurants(api + '?page=1').catch(handleError)
  isLocal() && console.log(api, restaurants)
  $app.innerHTML = Mustache.render($template.innerHTML, {
    header,
    index: restaurants.map((restaurant, index) => {
      return {
        title: restaurant.title,
        slug: `${slugify(restaurant.title)}-${index}`
      }
    }),
    restaurants: await formatRestaurants(restaurants).catch(handleError)
  })
  // Let images load for a bit & then scroll into view if possible
  setTimeout(() => {
    if (document.getElementById(window.location.hash.replace(/^#/, ''))) {
      document.getElementById(window.location.hash.replace(/^#/, '')).scrollIntoView()
      openMenuByHash()
    }
  }, 500)
})();

window.addEventListener('hashchange', openMenuByHash)
