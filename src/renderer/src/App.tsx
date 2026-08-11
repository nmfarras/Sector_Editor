import { JSX } from 'react'
import { HashRouter, Routes, Route } from 'react-router'

// import Start from '@pages/start/Index'
import SectorEditor from '@pages/editor/Index'

const App = (): JSX.Element => {
  return (
    <>
      <HashRouter>
        <Routes>
          {/* <Route path="/" element={<Start />} /> */}
          {/* <Route path="/editor" element={<SectorEditor />} /> */}
          <Route path="/" element={<SectorEditor />} />
        </Routes>
      </HashRouter>
    </>
  )
}

export default App
