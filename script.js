// const url = 'https://corsproxy.io/?' + encodeURIComponent('https://mspmag.com/promotions/restaurantweek')
const proxy = 'https://corsproxy.io/?'
const url = 'https://mspmag.com/promotions/restaurantweek/restaurant-week-2023/'
const $app = document.getElementById('app')
const $template = document.getElementById('template')

function handleError() {
  $app.innerHTML = `<p>Error scraping the API. Try again or visit the direct link: <a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a></p>`
}

async function getAPI() {
  const res = await fetch(proxy + encodeURIComponent(url))
  const html = await res.text()
  try {
    const parser = new DOMParser()
    const $dom = parser.parseFromString(html, 'text/html')
    const $scripts = Array.from($dom.querySelectorAll('script'))
    const $script = $scripts.filter($script => $script.innerHTML.trim().startsWith('var _mp_require = {')).pop()
    const json = JSON.parse($script.innerHTML.trim().replace(/^var _mp_require =/, '').replace(/;$/, ''))
    return Promise.resolve(json['config']['js/page_roundup_location']['locations_url'])
  } catch (e) {
    throw e
  }
}

async function getRestaurants(api) {
  let data = []
  while (true) {
    const res = await fetch(proxy + encodeURIComponent(api))
    const json = await res.json()
    data = data.concat(json.results)
    if (!json.more) break
    api = api.replace(/\?.*$/, `?page=${parseInt(json.page) + 1}`)
  }
  return data
}

async function formatRestaurants(restaurants) {
  return Promise.all(restaurants.map(async restaurant => {
    const parser = new DOMParser()
    const $html = parser.parseFromString(restaurant.html, 'text/html');
    const [html, menu_] = formatRestaurantHTML($html)
    const menu = await getMenu(menu_).catch(handleError)
    return {
      ...restaurant,
      html,
      menu
    }
  }))
}

function formatRestaurantHTML($html) {
  $html.querySelectorAll('a[name]').forEach($el => $el.remove())
  $html.querySelectorAll('.number').forEach($el => $el.remove())
  $html.querySelectorAll('[itemprop=name]').forEach($el => $el.remove())
  $html.querySelectorAll('img').forEach($img => {
    $img.srcset = ''
    $img.src = $img.src.replace(/\?.*$/, '')
    $img.removeAttribute('width')
    $img.removeAttribute('height')
  })
  $html.querySelectorAll('a[href^=http]').forEach($a => {
    $a.target = '_blank'
    $a.rel = 'noopener noreferrer'
  })
  $html.querySelectorAll('.info a').forEach($a => {
    $a.classList.add('button')
  })
  const menu = Array.from($html.querySelectorAll('a')).find($a => $a.textContent.toLowerCase().trim() === 'menu').href
  return [$html.querySelector('li').innerHTML, menu]
}

async function getMenu(api) {
  const res = await fetch(proxy + api)
  const html = await res.text()
  const parser = new DOMParser()
  const $html = parser.parseFromString(html, 'text/html')
  return Promise.resolve(formatMenuHTML($html))
}

function formatMenuHTML($html) {
  return $html.querySelector('.content').innerHTML
}

(async () => {
  const api = await getAPI().catch(handleError)
  const restaurants = await getRestaurants(api + '?page=1').catch(handleError)
  console.log(api, restaurants)
  $app.innerHTML = Mustache.render($template.innerHTML, { index: restaurants.map(r => { return { title: r.title } }),restaurants: await formatRestaurants(restaurants).catch(handleError) })
})();
