import { Navigate, Route, Routes } from "react-router-dom";
import { useEffect, useState } from "react";
import { isAuthenticated } from "./utils/auth.js";

import Home from "./pages/Home/Home.jsx";
import Login from "./pages/Login/Login.jsx";
import AdminUsers from "./pages/Admin/Users.jsx";
import AdminProfiles from "./pages/Admin/Profiles.jsx";
import Recepcion from "./pages/Recepcion/Recepcion.jsx";
import RecepcionForm from "./pages/Recepcion/RecepcionForm.jsx";
import OrdenAdmision from "./pages/Recepcion/OrdenAdmision.jsx";
import CatalogoClientes from "./pages/Catalogos/Clientes.jsx";
import CatalogoGruposAutos from "./pages/Catalogos/GruposAutos.jsx";
import CatalogoMarcasAutos from "./pages/Catalogos/MarcasAutos.jsx";
import CatalogoAseguradoras from "./pages/Catalogos/Aseguradoras.jsx";
import CatalogoPartesAuto from "./pages/Catalogos/PartesAuto.jsx";
import CatalogoEstatusValuacion from "./pages/Catalogos/EstatusValuacion.jsx";
import CatalogoExpedientes from "./pages/Catalogos/Expedientes.jsx";
import HistorialIngresos from "./pages/Reportes/HistorialIngresos.jsx";
import ListadoVehiculosValuacion from "./pages/Valuacion/ListadoVehiculos.jsx";
import ValuarVehiculo from "./pages/Valuacion/ValuarVehiculo.jsx";

export default function App() {
  const [, setAuthPulse] = useState(0);

  useEffect(() => {
    const tick = window.setInterval(() => {
      setAuthPulse((value) => value + 1);
    }, 60_000);

    const onStorage = (event) => {
      if (event.key === "lmcc_user") {
        setAuthPulse((value) => value + 1);
      }
    };

    window.addEventListener("storage", onStorage);
    return () => {
      window.clearInterval(tick);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const authenticated = isAuthenticated();

  return (
    <Routes>
      <Route path="/login" element={authenticated ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/" element={authenticated ? <Home /> : <Navigate to="/login" replace />} />
      <Route
        path="/recepcion"
        element={authenticated ? <Recepcion /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/recepcion/ordenes"
        element={authenticated ? <OrdenAdmision /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/recepcion/nuevo"
        element={authenticated ? <RecepcionForm /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/admin/users"
        element={authenticated ? <AdminUsers /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/admin/profiles"
        element={authenticated ? <AdminProfiles /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/catalogos/clientes"
        element={authenticated ? <CatalogoClientes /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/catalogos/grupos-autos"
        element={authenticated ? <CatalogoGruposAutos /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/catalogos/marcas-autos"
        element={authenticated ? <CatalogoMarcasAutos /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/catalogos/aseguradoras"
        element={authenticated ? <CatalogoAseguradoras /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/catalogos/partes-auto"
        element={authenticated ? <CatalogoPartesAuto /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/catalogos/estatus-valuacion"
        element={authenticated ? <CatalogoEstatusValuacion /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/catalogos/expedientes"
        element={authenticated ? <CatalogoExpedientes /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/reportes/historial"
        element={authenticated ? <HistorialIngresos /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/valuacion/vehiculos"
        element={authenticated ? <ListadoVehiculosValuacion /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/valuacion/vehiculos/:id"
        element={authenticated ? <ValuarVehiculo /> : <Navigate to="/login" replace />}
      />
      <Route path="*" element={<Navigate to={authenticated ? "/" : "/login"} replace />} />
    </Routes>
  );
}
