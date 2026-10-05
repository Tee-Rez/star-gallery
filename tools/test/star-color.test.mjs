import test from 'node:test'
import assert from 'node:assert/strict'
import {bbColor, tempToRamp, rampForStar, rgbToHex, BB} from '../../orion/src/js/star-color.mjs'

test('ends of the ramp are its first and last stops', () => {
  assert.deepEqual(bbColor(0), BB[0])
  assert.deepEqual(bbColor(1), BB[BB.length - 1])
})

test('ramp is log-T between 2500K and 30000K', () => {
  assert.equal(tempToRamp(2500), 0)
  assert.equal(tempToRamp(30000), 1)
  assert.equal(tempToRamp(0), -1)
})

test('spectral class is the fallback when there is no temperature', () => {
  assert.equal(rampForStar({spectralClass: 'B7III'}), tempToRamp(15000))
  assert.equal(rampForStar({tempKelvin: 9330, spectralClass: 'B'}), tempToRamp(9330))
  assert.equal(rampForStar({}), -1)
})

test('hex is lower-case and six digits', () => {
  assert.equal(rgbToHex([1, 0.5, 0]), '#ff8000')
})
