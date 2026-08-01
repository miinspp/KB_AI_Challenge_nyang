import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

const PHONE_WIDTH = 430
const PHONE_HEIGHT = 900
const FRAME_GUTTER = 32

function getPhoneScale() {
  if (window.matchMedia('(max-width: 600px)').matches) return 1

  return Math.min(
    1,
    (window.innerWidth - FRAME_GUTTER) / PHONE_WIDTH,
    (window.innerHeight - FRAME_GUTTER) / PHONE_HEIGHT,
  )
}

function DevicePreview() {
  const [phoneScale, setPhoneScale] = React.useState(getPhoneScale)

  React.useEffect(() => {
    const updatePhoneScale = () => setPhoneScale(getPhoneScale())
    window.addEventListener('resize', updatePhoneScale)
    updatePhoneScale()

    return () => window.removeEventListener('resize', updatePhoneScale)
  }, [])

  return (
    <div className="phone-stage">
      <div
        className="phone-scale-box"
        style={{
          width: `${PHONE_WIDTH * phoneScale}px`,
          height: `${PHONE_HEIGHT * phoneScale}px`,
        }}
      >
        <div className="phone-frame" style={{ '--phone-scale': phoneScale }}>
          <div className="phone-screen">
            <App />
          </div>
        </div>
      </div>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {/* Desktop-only device chrome. App keeps ownership of every route and screen. */}
    <DevicePreview />
  </React.StrictMode>
)
