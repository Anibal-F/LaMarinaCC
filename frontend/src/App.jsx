import { Navigate, Route, Routes } from "react-router-dom";

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
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/recepcion" element={<Recepcion />} />
      <Route path="/recepcion/ordenes" element={<OrdenAdmision />} />
      <Route path="/recepcion/nuevo" element={<RecepcionForm />} />
      <Route path="/admin/users" element={<AdminUsers />} />
      <Route path="/admin/profiles" element={<AdminProfiles />} />
      <Route path="/catalogos/clientes" element={<CatalogoClientes />} />
      <Route path="/catalogos/grupos-autos" element={<CatalogoGruposAutos />} />
      <Route path="/catalogos/marcas-autos" element={<CatalogoMarcasAutos />} />
      <Route path="/catalogos/aseguradoras" element={<CatalogoAseguradoras />} />
      <Route path="/catalogos/partes-auto" element={<CatalogoPartesAuto />} />
      <Route path="/catalogos/estatus-valuacion" element={<CatalogoEstatusValuacion />} />
      <Route path="/catalogos/expedientes" element={<CatalogoExpedientes />} />
      <Route path="/reportes/historial" element={<HistorialIngresos />} />
      <Route path="/valuacion/vehiculos" element={<ListadoVehiculosValuacion />} />
      <Route path="/valuacion/vehiculos/:id" element={<ValuarVehiculo />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
