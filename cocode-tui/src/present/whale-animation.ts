export type WhaleLogoSize = 'large' | 'medium' | 'small' | 'inline'

export type CharacterAnimation = {
  interval: number
  accentRows: number
  frames: readonly string[]
}

type WhaleSpec = {
  width: number
  bodyMask: readonly string[]
  spoutMasks: readonly (readonly string[])[]
  eye: { row: number; column: number }
  brand: { row: number; column: number }
}

const BINARY_PATTERN = '0001110100111010'

const LARGE_SPEC: WhaleSpec = {
  width: 68,
  spoutMasks: [
    [
      '                       ###     ###',
      '                   ######## ########',
      '                     #############',
      '                         ######',
    ],
    [
      '                    ###   ###   ###',
      '                 ###################',
      '                    ###############',
      '                        ########',
    ],
    [
      '                  ####  #######  ####',
      '                #####################',
      '                   ################',
      '                       #########',
    ],
  ],
  bodyMask: [
    '               #####################################                ',
    '        ###################################################    #####',
    '   ########################################################## #######',
    '####################################################################',
    ' #################################################################  ',
    '    ######################################################### #######',
    '         ###############################################       #####',
    '                ###################################                 ',
    '                              ########                              ',
  ],
  eye: { row: 3, column: 7 },
  brand: { row: 4, column: 29 },
}

const MEDIUM_SPEC: WhaleSpec = {
  width: 50,
  spoutMasks: [
    ['                 ###   ###', '              #############', '                  ######'],
    ['               ### ### ###', '             ###############', '                 #######'],
    ['              #### ##### ####', '            #################', '                ########'],
  ],
  bodyMask: [
    '          ############################          ',
    '     ###################################   #### ',
    '  ######################################## #### ',
    '##############################################  ',
    '  ######################################## #### ',
    '     ###################################   #### ',
    '          ############################          ',
    '                       ####                     ',
  ],
  eye: { row: 3, column: 5 },
  brand: { row: 4, column: 18 },
}

const SMALL_SPEC: WhaleSpec = {
  width: 34,
  spoutMasks: [
    ['            ### ###', '          ###########'],
    ['          ### ### ###', '         #############'],
  ],
  bodyMask: [
    '       ###################        ',
    '   #########################  ### ',
    '##################################',
    '  ##########################  ### ',
    '       ###################        ',
  ],
  eye: { row: 2, column: 4 },
  brand: { row: 2, column: 13 },
}

export const LARGE_WHALE_ANIMATION = createWhaleAnimation(LARGE_SPEC)
export const MEDIUM_WHALE_ANIMATION = createWhaleAnimation(MEDIUM_SPEC)
export const SMALL_WHALE_ANIMATION = createWhaleAnimation(SMALL_SPEC)

export const INLINE_WHALE_ANIMATION: CharacterAnimation = {
  interval: 160,
  accentRows: 1,
  frames: ['001🐋011', '010🐋101', '101🐋010', '011🐋100'],
}

export function animationForWhaleSize(size: WhaleLogoSize): CharacterAnimation {
  switch (size) {
    case 'large':
      return LARGE_WHALE_ANIMATION
    case 'medium':
      return MEDIUM_WHALE_ANIMATION
    case 'small':
      return SMALL_WHALE_ANIMATION
    case 'inline':
      return INLINE_WHALE_ANIMATION
  }
}

function createWhaleAnimation(spec: WhaleSpec): CharacterAnimation {
  return {
    interval: 140,
    accentRows: spec.spoutMasks[0]?.length ?? 0,
    frames: Array.from({ length: 12 }, (_, phase) => {
      const spoutMask = spec.spoutMasks[phase % spec.spoutMasks.length] ?? []
      return [...renderBinaryMask(spoutMask, phase + 5), ...renderWhaleBody(spec, phase)]
        .map((line) => normalizeLine(line, spec.width))
        .join('\n')
    }),
  }
}

function renderWhaleBody(spec: WhaleSpec, phase: number): string[] {
  const body = renderBinaryMask(spec.bodyMask, phase)
  body[spec.eye.row] = replaceAt(body[spec.eye.row] ?? '', spec.eye.column, '●')
  body[spec.brand.row] = replaceAt(body[spec.brand.row] ?? '', spec.brand.column, 'cocode')
  return body
}

function renderBinaryMask(mask: readonly string[], phase: number): string[] {
  return mask.map((line, row) =>
    Array.from(line)
      .map((character, column) => {
        if (character !== '#') return character
        return BINARY_PATTERN[(row * 5 + column + phase) % BINARY_PATTERN.length] ?? '0'
      })
      .join(''),
  )
}

function replaceAt(line: string, index: number, value: string): string {
  return `${line.slice(0, index)}${value}${line.slice(index + value.length)}`
}

function normalizeLine(line: string, width: number): string {
  return line.slice(0, width).padEnd(width)
}
