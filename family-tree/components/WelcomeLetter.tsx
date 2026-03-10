'use client'

import { useState } from 'react'
import { X } from 'lucide-react'

interface WelcomeLetterProps {
  onClose: () => void
}

const LETTER_EN = `
Welcome to Roots — our family tree, built with love (and a lot of code).

A few things to know before you dive in:

When you first sign in, press the refresh button between the sign out and add member buttons to space everyone out. 

Works best on a laptop or desktop. Mobile will work, but it's a bit cramped for all our branches.

You can add people, photos, and notes freely — but you cannot delete anything. If something needs to be removed (typos happen, I know), just hit the "Request deletion" button and I'll take care of it. This is intentional — I don't want anyone accidentally erasing grandma.

To add a new family member, click the gold "+ Add member" button in the top right, or the little + dot on any card to add someone connected to that person.

To connect two people who are already on the tree, hover over a card until the dots appear, then drag from a dot to another card. A popup will ask you what the relationship is.

Each person has a Scrapbook — double-click their card, then click "Open Scrapbook." You can add photos and written notes there. Please keep photos reasonable (no videos, but you can paste a link to a Google Drive album or YouTube in a note). You can't delete anything from the scrapbook either, only add — so think before you upload!

Oh, and the family code? 66 61 6D 69 6C 79. That's "family" in hexadecimal. Nerdy, I know. 🤓



Nat ♡`

const LETTER_ES = `
Bienvenidos a Roots — nuestro árbol genealógico, hecho con amor (y mucho código).

Algunas cosas importantes antes de empezar:

Cuando inicie sesión por primera vez, presione el botón actualizar entre los botones cerrar sesión y agregar miembro para espaciar a todos.

Funciona mejor en una computadora o laptop. En el celular funciona, pero es un poco pequeño para todas nuestras ramas.

Puedes agregar personas, fotos y notas libremente — pero no puedes eliminar nada. Si algo necesita borrarse (los errores pasan, lo sé), haz clic en "Solicitar eliminación" y yo me encargo. Esto es intencional — no quiero que nadie borre a la Abuela por accidente.

Para agregar un familiar nuevo, haz clic en el botón dorado "+ Add member" arriba a la derecha, o en el pequeño + en cualquier tarjeta para agregar a alguien conectado a esa persona.

Para conectar a dos personas que ya están en el árbol, pasa el cursor sobre una tarjeta hasta que aparezcan los puntos, luego arrastra desde un punto hasta otra tarjeta. Un menú te preguntará cuál es la relación.

Cada persona tiene un Álbum de recortes (Scrapbook) — haz doble clic en su tarjeta y luego clic en "Open Scrapbook." Puedes agregar fotos y notas escritas. Por favor mantén las fotos razonables (no videos, pero puedes pegar un enlace a Google Drive o YouTube en una nota). Tampoco puedes eliminar nada del álbum — ¡solo agregar, así que piénsalo antes de subir algo!

Ah, y el código familiar: 66 61 6D 69 6C 79. Eso es "family" (familia) en hexadecimal. Muy nerd, lo sé. 🤓



Nat ♡`

export default function WelcomeLetter({ onClose }: WelcomeLetterProps) {
  const [lang, setLang] = useState<'en' | 'es'>('en')
  const letter = lang === 'en' ? LETTER_EN : LETTER_ES

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
      background: 'rgba(0,0,0,0.85)',
      backdropFilter: 'blur(6px)',
    }}>
      <div style={{
        position: 'relative',
        width: '100%',
        maxWidth: 580,
        maxHeight: '88vh',
        overflowY: 'auto',
        // Torn paper effect
        background: '#f5edd8',
        borderRadius: '2px 2px 2px 2px',
        padding: '40px 44px 48px',
        boxShadow: '0 20px 80px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.3)',
        // Torn top edge via clip-path
        clipPath: `polygon(
          0% 2%, 2% 0%, 4% 1.5%, 6% 0.5%, 8% 2%, 10% 0.8%, 12% 2%, 
          14% 0.3%, 16% 1.8%, 18% 0%, 20% 1.5%, 22% 0.5%, 24% 2%, 
          26% 0.8%, 28% 1.5%, 30% 0%, 32% 2%, 34% 0.5%, 36% 1.8%, 
          38% 0.3%, 40% 2%, 42% 0.8%, 44% 1.5%, 46% 0.2%, 48% 2%, 
          50% 0.5%, 52% 1.8%, 54% 0%, 56% 2%, 58% 0.8%, 60% 1.5%, 
          62% 0.3%, 64% 2%, 66% 0.5%, 68% 1.8%, 70% 0%, 72% 2%, 
          74% 0.8%, 76% 1.5%, 78% 0.3%, 80% 2%, 82% 0.5%, 84% 1.8%, 
          86% 0%, 88% 2%, 90% 0.8%, 92% 1.5%, 94% 0.3%, 96% 2%, 98% 0.5%, 100% 2%,
          100% 98%, 98% 100%, 96% 98.5%, 94% 100%, 92% 98%, 90% 99.5%,
          88% 98%, 86% 100%, 84% 98.5%, 82% 99%, 80% 100%, 78% 98%,
          0% 100%
        )`,
      }}>
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 16, right: 16,
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#8a7050', padding: 4,
          }}
        >
          <X size={18} />
        </button>

        {/* Language toggle */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
          {(['en', 'es'] as const).map(l => (
            <button key={l} onClick={() => setLang(l)} style={{
              padding: '3px 10px', borderRadius: 20, fontSize: 11,
              fontFamily: 'DM Mono, monospace', cursor: 'pointer',
              background: lang === l ? '#c49040' : 'transparent',
              color: lang === l ? '#f5edd8' : '#8a7050',
              border: `1px solid ${lang === l ? '#c49040' : '#c8b890'}`,
            }}>
              {l === 'en' ? 'English' : 'Español'}
            </button>
          ))}
        </div>

        {/* Letter content */}
        <div style={{
          fontFamily: 'Lora, serif',
          fontSize: 14,
          color: '#3a2c10',
          lineHeight: 1.85,
          whiteSpace: 'pre-wrap',
        }}>
          {letter}
        </div>

        {/* Decorative line */}
        <div style={{ borderTop: '1px solid #c8b890', marginTop: 24, paddingTop: 12, textAlign: 'center' }}>
          <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: '#8a7050', letterSpacing: '0.15em' }}>
            66 61 6D 69 6C 79
          </span>
        </div>

        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button onClick={onClose} style={{
            background: '#c49040', border: 'none', borderRadius: 8,
            padding: '8px 24px', fontFamily: 'Playfair Display, serif',
            fontSize: 13, fontWeight: 600, color: '#1a1208', cursor: 'pointer',
          }}>
            {lang === 'en' ? 'Enter the tree 🌳' : 'Entrar al árbol 🌳'}
          </button>
        </div>
      </div>
    </div>
  )
}
