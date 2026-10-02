// node --experimental-strip-types checks/files.ts
import assert from 'node:assert/strict'
import { flagColor } from '../src/lib/color.ts'
import { parse } from '../src/lib/files.ts'

assert.equal(flagColor('<path fill="#eee"/><path fill="#6da544"/><path fill="#d80027"/>'), '#6da544')
assert.equal(flagColor('<path fill="#333333"/><path fill="#d80027"/>'), '#d80027')
assert.equal(flagColor('<path fill="#fff"/><path fill="#eeeeee"/>'), undefined)

assert.deepEqual(parse('en.json', '{"checkout":{"title":"Checkout","total":"Total: {amount}"},"flat.key":"x","n":3}'), {
  'checkout.title': 'Checkout',
  'checkout.total': 'Total: {amount}',
  'flat.key': 'x',
})
assert.deepEqual(parse('it.properties', '# comment\ncart.title = Carrello\ncart.long=Uno \\\n  due\nunicode=caff\\u00e8\nescaped\\=key: v\n'), {
  'cart.title': 'Carrello',
  'cart.long': 'Uno due',
  unicode: 'caffè',
  'escaped=key': 'v',
})
assert.deepEqual(parse('fr.strings', '/* note */\n"cart.title" = "Panier";\n"quote" = "Un \\"mot\\"";\n'), {
  'cart.title': 'Panier',
  quote: 'Un "mot"',
})
console.log('files: ok')
