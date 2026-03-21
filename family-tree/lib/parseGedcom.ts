export interface GedcomPerson {
  id: string           // GEDCOM @I123@ id
  name: string
  sex: string | null
  birthYear: number | null
  birthDate: string | null
  birthPlace: string | null
  deathYear: number | null
  deathDate: string | null
  deathPlace: string | null
  isDeceased: boolean
  notes: string[]
}

export interface GedcomFamily {
  id: string
  husbandId: string | null
  wifeId: string | null
  childIds: string[]
  marriageDate: string | null
  marriagePlace: string | null
}

export interface GedcomData {
  persons: GedcomPerson[]
  families: GedcomFamily[]
}

function parseDate(dateStr: string): { year: number | null; full: string | null } {
  if (!dateStr) return { year: null, full: null }
  const clean = dateStr.trim()
    .replace(/^(ABT|ABOUT|CAL|EST|BEF|AFT|BET|AND)\s+/i, '')
    .replace(/\s+/g, ' ')

  // Try full date formats
  const fullMatch = clean.match(/(\d{1,2})\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+(\d{3,4})/i)
  if (fullMatch) {
    const months: Record<string, string> = {
      JAN:'01',FEB:'02',MAR:'03',APR:'04',MAY:'05',JUN:'06',
      JUL:'07',AUG:'08',SEP:'09',OCT:'10',NOV:'11',DEC:'12'
    }
    const m = months[fullMatch[2].toUpperCase()]
    const d = fullMatch[1].padStart(2, '0')
    const y = fullMatch[3]
    // Only return full date for years >= 1000 (valid for date type)
    const yr = parseInt(y)
    if (yr >= 1000 && yr <= 9999) {
      return { year: yr, full: `${y}-${m}-${d}` }
    }
    return { year: yr, full: null }
  }

  // Year only
  const yearMatch = clean.match(/\b(\d{3,4})\b/)
  if (yearMatch) return { year: parseInt(yearMatch[1]), full: null }

  return { year: null, full: null }
}

export function parseGedcom(text: string): GedcomData {
  const lines = text.split(/\r?\n/)
  const persons: GedcomPerson[] = []
  const families: GedcomFamily[] = []

  let i = 0
  while (i < lines.length) {
    const line = lines[i].trim()
    const match = line.match(/^(\d+)\s+(@[^@]+@|\w+)\s*(.*)$/)
    if (!match) { i++; continue }

    const level = parseInt(match[1])
    const tag = match[2]
    const value = match[3].trim()

    if (level === 0 && tag.startsWith('@') && value === 'INDI') {
      // Parse individual
      const person: GedcomPerson = {
        id: tag, name: '', sex: null,
        birthYear: null, birthDate: null, birthPlace: null,
        deathYear: null, deathDate: null, deathPlace: null,
        isDeceased: false, notes: []
      }
      i++
      while (i < lines.length) {
        const l = lines[i].trim()
        const lm = l.match(/^(\d+)\s+(\S+)\s*(.*)$/)
        if (!lm) { i++; continue }
        const lv = parseInt(lm[1])
        if (lv === 0) break
        const lt = lm[2]; const lval = lm[3].trim()

        if (lv === 1 && lt === 'NAME') {
          person.name = lval.replace(/\//g, '').replace(/\s+/g, ' ').trim()
        } else if (lv === 1 && lt === 'SEX') {
          person.sex = lval
        } else if (lv === 1 && (lt === 'BIRT' || lt === 'BIRTH')) {
          i++
          while (i < lines.length) {
            const bl = lines[i].trim().match(/^(\d+)\s+(\S+)\s*(.*)$/)
            if (!bl || parseInt(bl[1]) <= 1) break
            if (bl[2] === 'DATE') {
              const parsed = parseDate(bl[3])
              person.birthYear = parsed.year
              person.birthDate = parsed.full
            } else if (bl[2] === 'PLAC') {
              person.birthPlace = bl[3].trim()
            }
            i++
          }
          continue
        } else if (lv === 1 && (lt === 'DEAT' || lt === 'DEATH')) {
          person.isDeceased = true
          if (lval === 'Y') { i++; continue }
          i++
          while (i < lines.length) {
            const dl = lines[i].trim().match(/^(\d+)\s+(\S+)\s*(.*)$/)
            if (!dl || parseInt(dl[1]) <= 1) break
            if (dl[2] === 'DATE') {
              const parsed = parseDate(dl[3])
              person.deathYear = parsed.year
              person.deathDate = parsed.full
            } else if (dl[2] === 'PLAC') {
              person.deathPlace = dl[3].trim()
            }
            i++
          }
          continue
        } else if (lv === 1 && lt === 'NOTE') {
          let note = lval
          i++
          while (i < lines.length) {
            const nl = lines[i].trim().match(/^(\d+)\s+(\S+)\s*(.*)$/)
            if (!nl || parseInt(nl[1]) <= 1) break
            if (nl[2] === 'CONT' || nl[2] === 'CONC') note += '\n' + nl[3]
            i++
          }
          if (note) person.notes.push(note)
          continue
        }
        i++
      }
      if (person.name) persons.push(person)
      continue
    }

    if (level === 0 && tag.startsWith('@') && value === 'FAM') {
      const family: GedcomFamily = {
        id: tag, husbandId: null, wifeId: null,
        childIds: [], marriageDate: null, marriagePlace: null
      }
      i++
      while (i < lines.length) {
        const l = lines[i].trim()
        const lm = l.match(/^(\d+)\s+(\S+)\s*(.*)$/)
        if (!lm) { i++; continue }
        const lv = parseInt(lm[1])
        if (lv === 0) break
        const lt = lm[2]; const lval = lm[3].trim()

        if (lv === 1 && lt === 'HUSB') family.husbandId = lval
        else if (lv === 1 && lt === 'WIFE') family.wifeId = lval
        else if (lv === 1 && lt === 'CHIL') family.childIds.push(lval)
        else if (lv === 1 && lt === 'MARR') {
          i++
          while (i < lines.length) {
            const ml = lines[i].trim().match(/^(\d+)\s+(\S+)\s*(.*)$/)
            if (!ml || parseInt(ml[1]) <= 1) break
            if (ml[2] === 'DATE') family.marriageDate = ml[3].trim()
            else if (ml[2] === 'PLAC') family.marriagePlace = ml[3].trim()
            i++
          }
          continue
        }
        i++
      }
      families.push(family)
      continue
    }
    i++
  }

  return { persons, families }
}
