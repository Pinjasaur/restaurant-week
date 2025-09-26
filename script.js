const isLocal = () => window.location.hostname === 'localhost'
// const url = 'https://corsproxy.io/?' + encodeURIComponent('https://mspmag.com/promotions/restaurantweek')
const proxy = !isLocal() ? '/proxy/mspmag.com/' : 'https://corsproxy.io/?url='
// const canonical = `https://mspmag.com/promotions/restaurantweek/restaurant-week-${new Date().getFullYear()}/`
const canonical = `https://mspmag.com/restaurant-week-2025/`
const BASE_URL = !isLocal() ? canonical.replace(/^https:\/\/mspmag.com\//, '') : encodeURIComponent(canonical)
const $app = document.getElementById('app')
const $template = document.getElementById('template')

function handleError(e) {
  $app.innerHTML = `<p>Error: ${e.message.toString()} <br><br> Try again or visit the direct link: <a href="${canonical}" target="_blank" rel="noopener noreferrer">${canonical}</a></p>`
}

async function getAPI() {
  const res = await fetch(proxy + BASE_URL)
  const html = await res.text()
  try {
    const parser = new DOMParser()
    const $dom = parser.parseFromString(html, 'text/html')
    // const $title = $dom.querySelector('#title > h1')
    const $title = $dom.querySelector('#main .lead')
    const $img = $dom.querySelectorAll('#content img')[0]
    const $scripts = Array.from($dom.querySelectorAll('script'))
    const $script = $scripts.filter($script => $script.innerHTML.trim().startsWith('var _mp_require = {')).pop()
    const json = JSON.parse($script.innerHTML.trim().replace(/^var _mp_require =/, '').replace(/;$/, ''))
    try {
      json['config']['js/page_roundup_location']['locations_url']
    } catch (e) {
      return Promise.reject(Error("API not found, perhaps there's no current restaurant week."))
    }
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
    return Promise.reject(e)
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
    // Seemingly conflicts with Chrome UA stylesheet
    $img.removeAttribute('sizes')

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

function trackHashChange() {
  isLocal() && console.log('Tracking hashchange', location.pathname + location.search + location.hash)
  if (window.goatcounter && window.goatcounter.count)
    window.goatcounter.count({
      path: 'hashchange-' + location.pathname + location.search + location.hash,
      event: true
    })
}

;(async () => {
  try {
    const {api, header} = await getAPI()
    const restaurants = await getRestaurants(api + '?page=1')
    isLocal() && console.log(api, restaurants)
    $app.innerHTML = Mustache.render($template.innerHTML, {
      header,
      index: restaurants.map((restaurant, index) => {
        return {
          title: restaurant.title,
          slug: `${slugify(restaurant.title)}-${index}`
        }
      }),
      restaurants: await formatRestaurants(restaurants)
    })
  } catch (e) {
    handleError(e)
  }
  // Let images load for a bit & then scroll into view if possible
  setTimeout(() => {
    if (window.location.hash.replace(/^#/, '') && document.getElementById(window.location.hash.replace(/^#/, ''))) {
      document.getElementById(window.location.hash.replace(/^#/, '')).scrollIntoView()
      openMenuByHash()
    }
    // Track initial "pageview"
    isLocal() && console.log('Tracking initial "pageview"', location.pathname + location.search + location.hash)
    if (window.goatcounter && window.goatcounter.count)
      window.goatcounter.count({
        path: location.pathname + location.search + location.hash,
      })
  }, 500)
})();

window.addEventListener('hashchange', openMenuByHash)
window.addEventListener('hashchange', trackHashChange)
