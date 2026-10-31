/**
 * Script Principal - JoyaExpress
 * Gestión de eventos y lógica de la aplicación
 */

const API_URL = '/joyaexpress-system/backend/api';
let usuarioActual = null;

// ===============================================
// INICIALIZACIÓN
// ===============================================

document.addEventListener('DOMContentLoaded', function() {
    verificarSesion();
    
    // Event Listeners
    document.getElementById('login-form').addEventListener('submit', manejarLogin);
    document.getElementById('form-nueva-encomienda').addEventListener('submit', crearEncomienda);
    document.getElementById('form-nueva-maleta').addEventListener('submit', crearMaleta);
    document.getElementById('tab-buscar-enc').addEventListener('shown.bs.tab', buscarEncomiendas);
    
});

// ===============================================
// AUTENTICACIÓN
// ===============================================

async function leerRespuestaAuth(response) {
    const texto = await response.text();
    let datos;
    try {
        datos = JSON.parse(texto);
    } catch {
        console.error('Respuesta inválida de autenticación. HTTP:', response.status);
        throw new Error(`El servidor no devolvió JSON válido (HTTP ${response.status}). Verifique la dirección del sistema y que Apache y MySQL estén iniciados.`);
    }
    if (!datos || typeof datos.exito !== 'boolean') {
        throw new Error('El servidor devolvió una respuesta de autenticación inválida.');
    }
    if (!response.ok) {
        throw new Error(datos.mensaje || `Error del servidor (HTTP ${response.status}).`);
    }
    return datos;
}

function verificarSesion() {
    fetch(`${API_URL}/auth.php?accion=estado`)
        .then(leerRespuestaAuth)
        .then(data => {
            if (data.exito) {
                mostrarDashboard();
                obtenerUsuarioActual();
            } else {
                mostrarLogin();
            }
        })
        .catch(error => {
            console.error('Error:', error);
            mostrarLogin();
        });
}

function manejarLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const errorDiv = document.getElementById('login-error');
    
    fetch(`${API_URL}/auth.php?accion=login`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
    })
    .then(leerRespuestaAuth)
    .then(data => {
        if (data.exito) {
            usuarioActual = data.datos.usuario;
            mostrarDashboard();
            aplicarPermisos();
            obtenerUsuarioActual();
            errorDiv.style.display = 'none';
        } else {
            errorDiv.textContent = data.mensaje;
            errorDiv.style.display = 'block';
        }
    })
    .catch(error => {
        errorDiv.textContent = error.message || 'No se pudo conectar con el servidor.';
        errorDiv.style.display = 'block';
    });
}

function obtenerUsuarioActual() {
    fetch(`${API_URL}/auth.php?accion=usuario_actual`)
        .then(response => response.json())
        .then(data => {
            if (data.exito) {
                usuarioActual = data.datos;
                document.getElementById('usuario-nombre').textContent = usuarioActual.nombre;
                aplicarPermisos();
            }
        });
}

function tieneRol(roles) {
    return usuarioActual && roles.includes(usuarioActual.rol);
}

function aplicarPermisos() {
    const puedeRegistrar = tieneRol(['admin', 'supervisor', 'recepcion']);
    const puedeMaletas = tieneRol(['admin', 'supervisor', 'bodega']);
    document.getElementById('form-nueva-encomienda').closest('.tab-pane').querySelectorAll('input, select, textarea, button')
        .forEach(control => control.disabled = !puedeRegistrar);
    document.getElementById('form-nueva-maleta').querySelectorAll('input, select, textarea, button')
        .forEach(control => control.disabled = !puedeMaletas);
    if (typeof inicializarModuloOperaciones === 'function') inicializarModuloOperaciones();
}

function logout() {
    fetch(`${API_URL}/auth.php?accion=logout`, {
        method: 'POST'
    })
    .then(response => response.json())
    .then(data => {
        mostrarLogin();
        usuarioActual = null;
    });
}

// ===============================================
// INTERFAZ
// ===============================================

function mostrarLogin() {
    document.getElementById('login-container').style.display = 'flex';
    document.getElementById('dashboard-container').style.display = 'none';
}

function mostrarDashboard() {
    document.getElementById('login-container').style.display = 'none';
    document.getElementById('dashboard-container').style.display = 'block';
    mostrarSeccion('dashboard');
    cargarEstadisticas();
    cargarMaletasAbiertas();
}

function mostrarSeccion(seccion) {
    // Ocultar todas las secciones
    document.querySelectorAll('.seccion').forEach(s => {
        s.style.display = 'none';
    });
    
    // Mostrar la solicitada
    const elemento = document.getElementById(`seccion-${seccion}`);
    if (elemento) {
        elemento.style.display = 'block';
        document.querySelectorAll('#navbarNav .nav-link').forEach(link => {
            const destino = link.getAttribute('onclick') || '';
            link.classList.toggle('active', destino.includes(`'${seccion}'`));
        });
        if (window.innerWidth < 992) {
            const collapse = document.getElementById('navbarNav');
            const instancia = bootstrap.Collapse.getInstance(collapse);
            if (instancia) instancia.hide();
        }
        
        // Cargar datos específicos
        if (seccion === 'maletas') {
            cargarMaletasAbiertas();
        } else if (seccion === 'reportes') {
            cargarEstadisticas();
            if (typeof cargarReportesAvanzados === 'function') cargarReportesAvanzados();
        }
    }
}

// ===============================================
// ENCOMIENDAS
// ===============================================
let inicioFormularioEncomienda = Date.now();

function crearEncomienda(e) {
    e.preventDefault();
    
    const form = e.target;
    const formData = new FormData(form);
    const datos = {};
    
    formData.forEach((value, key) => {
        datos[key] = value;
    });
    
    // Convertir valores numéricos
    datos.cantidad_items = parseInt(datos.cantidad_items);
    datos.peso_kg = parseFloat(datos.peso_kg);
    datos.costo_quetzales = parseFloat(datos.costo_quetzales) || 0;
    datos.pagado = false;
    datos.duracion_registro_segundos = Math.max(1, Math.round((Date.now() - inicioFormularioEncomienda) / 1000));
    
    fetch(`${API_URL}/encomiendas.php?accion=crear`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(datos)
    })
    .then(response => response.json())
    .then(data => {
        if (data.exito) {
            mostrarAlerta('success', `Encomienda registrada: ${data.datos.tracking_id}`);
            form.reset();
            inicioFormularioEncomienda = Date.now();
            
            // Generar QR
            generarQR(data.datos.tracking_id);
            cargarEstadisticas();
            
            // Limpiar después de 3 segundos
            setTimeout(() => {
                form.reset();
            }, 3000);
        } else {
            mostrarAlerta('danger', 'Error: ' + data.mensaje);
        }
    })
    .catch(error => {
        if (typeof guardarEncomiendaPendiente === 'function') guardarEncomiendaPendiente(datos);
        mostrarAlerta('danger', 'Error en la conexión: ' + error);
    });
}

async function buscarEncomiendas() {
    const inicioBusqueda = performance.now();
    const input = document.getElementById('input-busqueda');
    const contenedor = document.getElementById('resultados-busqueda');
    const termino = input.value.trim();
    const estado = document.getElementById('filtro-estado')?.value || '';
    
    if (false && !termino) {
        contenedor.innerHTML = '<div class="alert alert-warning">Ingrese un término de búsqueda</div>';
        return;
    }

    contenedor.innerHTML = '<div class="alert alert-secondary">Buscando...</div>';

    try {
        const filtro = `${termino ? `&termino=${encodeURIComponent(termino)}` : ''}${estado ? `&estado=${encodeURIComponent(estado)}` : ''}`;
        const url = `${API_URL}/encomiendas.php?accion=buscar${filtro}`;
        const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
        const texto = await response.text();
        let data;

        try {
            data = JSON.parse(texto);
        } catch (error) {
            throw new Error('El servidor no devolvió una respuesta JSON válida');
        }

        if (!response.ok || !data.exito) {
            throw new Error(data.mensaje || `Error HTTP ${response.status}`);
        }

        mostrarResultadosBusqueda(data.datos);
        if (typeof registrarMetricaOperacion === 'function') registrarMetricaOperacion('busqueda', Math.round(performance.now()-inicioBusqueda), true);
    } catch (error) {
        console.error('Error al buscar:', error);
        contenedor.innerHTML = `<div class="alert alert-danger">No se pudo buscar: ${error.message}</div>`;
        if (typeof registrarMetricaOperacion === 'function') registrarMetricaOperacion('busqueda', Math.round(performance.now()-inicioBusqueda), false);
    }
}

document.getElementById('input-busqueda').addEventListener('keydown', function(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        buscarEncomiendas();
    }
});

function mostrarResultadosBusqueda(encomiendas) {
    if (!Array.isArray(encomiendas) || encomiendas.length === 0) {
        document.getElementById('resultados-busqueda').innerHTML =
            '<div class="alert alert-info">No se encontraron resultados</div>';
        return;
    }

    let html = '<table class="table table-hover">';
    html += '<thead><tr>';
    html += '<th>Tracking ID</th>';
    html += '<th>Destinatario</th>';
    html += '<th>País</th>';
    html += '<th>Estado</th>';
    html += '<th>Fecha</th>';
    html += '<th>Acciones</th>';
    html += '</tr></thead><tbody>';
    
    encomiendas.forEach(enc => {
        const clase_estado = `badge-estado-${enc.estado}`;
        html += `<tr>`;
        html += `<td><strong>${enc.tracking_id}</strong></td>`;
        html += `<td>${enc.destinatario_nombre}</td>`;
        html += `<td>${enc.destinatario_pais}</td>`;
        html += `<td><span class="badge ${clase_estado}">${enc.estado}</span></td>`;
        html += `<td>${new Date(enc.fecha_registro).toLocaleDateString('es-ES')}</td>`;
        html += `<td>
            <button class="btn btn-sm btn-info" onclick="verDetallesEncomienda(${enc.id})">
                <i class="fas fa-eye"></i>
            </button>
        </td>`;
        html += `</tr>`;
    });
    
    html += '</tbody></table>';
    document.getElementById('resultados-busqueda').innerHTML = html;
}

function verDetallesEncomienda(id) {
    fetch(`${API_URL}/encomiendas.php?accion=obtener&id=${id}`)
        .then(response => response.json())
        .then(data => {
            if (data.exito) {
                const enc = data.datos;
                const html = `
                    <div class="card">
                        <div class="card-header">
                            <h5>${enc.tracking_id}</h5>
                        </div>
                        <div class="card-body">
                            <h6>Remitente</h6>
                            <p><strong>${enc.remitente_nombre}</strong><br>
                               ${enc.remitente_pais} - ${enc.remitente_telefono}</p>
                            
                            <h6>Destinatario</h6>
                            <p><strong>${enc.destinatario_nombre}</strong><br>
                               ${enc.destinatario_direccion}<br>
                               ${enc.destinatario_pais} - ${enc.destinatario_telefono}</p>
                            
                            <h6>Contenido</h6>
                            <p>${enc.descripcion_items}</p>
                            
                            <div class="row">
                                <div class="col-md-6">
                                    <strong>Peso:</strong> ${enc.peso_kg} kg<br>
                                    <strong>Cantidad:</strong> ${enc.cantidad_items}<br>
                                    <strong>Costo:</strong> Q${enc.costo_quetzales}
                                </div>
                                <div class="col-md-6">
                                    <strong>Estado:</strong> <span class="badge badge-estado-${enc.estado}">${enc.estado}</span><br>
                                    <strong>Tipo Entrega:</strong> ${enc.tipo_entrega}<br>
                                    <strong>Pagado:</strong> ${enc.pagado ? 'Sí' : 'No'}
                                </div>
                            </div>
                        </div>
                    </div>
                `;
                
                // Mostrar en un modal
                mostrarModalDetalles('Detalles de Encomienda', html);
            }
        });
}

// Vista operativa de encomienda (reemplaza la vista básica anterior)
verDetallesEncomienda = async function(id) {
    try {
        const respuestas = await Promise.all([
            fetch(`${API_URL}/encomiendas.php?accion=obtener&id=${id}`, { cache: 'no-store' }),
            fetch(`${API_URL}/maletas.php?accion=abiertas`, { cache: 'no-store' }),
            fetch(`${API_URL}/encomiendas.php?accion=trazabilidad&encomienda_id=${id}`, { cache: 'no-store' })
        ]);
        const [data, dataMaletas, dataTraza] = await Promise.all(respuestas.map(r => r.json()));
        if (!data.exito) throw new Error(data.mensaje);

        const enc = data.datos;
        window.encomiendaDetalleActual = enc;
        const nombresEstado = {
            recibido:'Recibido', en_revision:'En revisión', revisado:'Revisado', aprobado:'Aprobado',
            observado:'Observado', empacado:'Empacado', asignado_maleta:'Asignado a maleta', enviado:'Enviado',
            recibido_destino:'Recibido en destino', en_ruta:'En ruta', entregado:'Entregado',
            listo_retiro:'Listo para retiro', retirado:'Retirado', incidencia:'Con incidencia'
        };
        const puedeEstado = tieneRol(['admin', 'supervisor', 'bodega', 'entrega']);
        const puedeMaleta = tieneRol(['admin', 'supervisor', 'bodega']);
        const todosEstados = ['recibido', 'en_revision', 'revisado', 'aprobado', 'observado', 'empacado', 'asignado_maleta', 'enviado',
            'recibido_destino', 'en_ruta', 'entregado', 'listo_retiro', 'retirado', 'incidencia'];
        const estadosPorRol = {
            admin: todosEstados,
            supervisor: todosEstados,
            bodega: ['en_revision', 'revisado', 'aprobado', 'observado', 'empacado', 'asignado_maleta', 'enviado', 'recibido_destino', 'incidencia'],
            entrega: ['en_ruta', 'entregado', 'listo_retiro', 'retirado', 'incidencia']
        };
        const transiciones = {
            recibido:['en_revision','incidencia'], en_revision:['aprobado','observado','incidencia'],
            revisado:['empacado','incidencia'], aprobado:['empacado','incidencia'], observado:['en_revision','aprobado','incidencia'],
            empacado:['incidencia'], asignado_maleta:['incidencia'], enviado:['incidencia'],
            recibido_destino: enc.destinatario_pais === 'USA' ? ['en_ruta','incidencia'] : ['listo_retiro','incidencia'],
            en_ruta:['entregado','incidencia'], listo_retiro:['retirado','incidencia'], incidencia:['en_revision','incidencia']
        };
        const permitidosRol = estadosPorRol[usuarioActual?.rol] || [];
        const estados = (transiciones[enc.estado] || []).filter(e => permitidosRol.includes(e));
        const opcionesEstados = estados.map(e => `<option value="${e}">${nombresEstado[e] || e.replaceAll('_', ' ')}</option>`).join('');
        const maletas = (dataMaletas.datos || []).filter(m => m.pais_destino === enc.destinatario_pais);
        const opcionesMaletas = maletas.map(m => `<option value="${m.id}">${m.id_maleta} (${m.peso_actual}/${m.limite_peso_kg} kg)</option>`).join('');
        const historial = (dataTraza.datos || []).map(t => `<li class="list-group-item"><strong>${t.estado.replaceAll('_', ' ')}</strong> — ${t.usuario_nombre || 'Sistema'}<br><small class="text-muted">${t.fecha_cambio}${t.observacion ? ' · ' + t.observacion : ''}</small></li>`).join('') || '<li class="list-group-item">Sin movimientos registrados</li>';

        const controlesEstado = puedeEstado && opcionesEstados ? `<div class="card mt-3"><div class="card-body"><h6>Cambiar al siguiente estado</h6><div class="row g-2"><div class="col-md-5"><select id="detalle-nuevo-estado" class="form-select">${opcionesEstados}</select></div><div class="col-md-5"><input id="detalle-observacion" class="form-control" placeholder="Observación opcional"></div><div class="col-md-2"><button class="btn btn-primary w-100" onclick="cambiarEstadoEncomienda(${enc.id})">Guardar</button></div></div></div></div>` : '';
        const mensajePaso = {
            recibido:'Cambie el estado a En revisión para iniciar la inspección.',
            en_revision:'Use el botón Inspeccionar y complete el checklist.',
            observado:'Corrija la observación, vuelva a En revisión y realice una nueva inspección.',
            aprobado:'La inspección fue aprobada. Cambie el estado a Empacado.',
            revisado:'La revisión terminó. Cambie el estado a Empacado.',
            empacado:'El paquete ya puede asignarse a una maleta abierta del mismo destino.',
            asignado_maleta:'El paquete ya se encuentra asignado a una maleta.'
        }[enc.estado] || 'Consulte la trazabilidad para conocer el siguiente paso.';
        const guiaFlujo = `<div class="alert alert-info workflow-guide"><strong><i class="fas fa-route me-2"></i>Estado actual: ${nombresEstado[enc.estado] || enc.estado}</strong><span>${mensajePaso}</span></div>`;
        const controlesMaleta = puedeMaleta && enc.estado === 'empacado'
            ? `<div class="card mt-3"><div class="card-body"><h6>Asignar a maleta</h6>${opcionesMaletas ? `<div class="input-group"><select id="detalle-maleta" class="form-select">${opcionesMaletas}</select><button class="btn btn-success" onclick="asignarEncomiendaAMaleta(${enc.id})">Asignar</button></div>` : '<div class="alert alert-info mb-0">No hay una maleta abierta para este país de destino.</div>'}</div></div>`
            : '';

        const accionesExtra = `<div class="card mt-3"><div class="card-body"><h6>Operaciones</h6><div class="d-flex flex-wrap gap-2">
            <button class="btn btn-outline-primary" onclick="imprimirEtiqueta(window.encomiendaDetalleActual)"><i class="fas fa-qrcode"></i> Etiqueta</button>
            <button class="btn btn-outline-primary" onclick="imprimirRecibo(window.encomiendaDetalleActual)"><i class="fas fa-print"></i> Recibo</button>
            ${puedeMaleta && ['en_revision','observado'].includes(enc.estado) ? `<button class="btn btn-outline-secondary" onclick="abrirInspeccion(${enc.id})"><i class="fas fa-clipboard-check"></i> Inspeccionar</button>` : ''}
            ${puedeEstado ? `<button class="btn btn-outline-warning" onclick="abrirNuevaIncidencia(${enc.id})">Incidencia</button>` : ''}
            ${tieneRol(['admin','supervisor','bodega']) && enc.destinatario_pais === 'USA' ? `<button class="btn btn-outline-info" onclick="asignarARuta(${enc.id})">Asignar ruta</button>` : ''}
            ${tieneRol(['admin','supervisor','entrega']) && enc.destinatario_pais==='USA' && enc.estado==='en_ruta' ? `<button class="btn btn-outline-success" onclick="abrirConfirmarEntrega(${enc.id},'entrega_domicilio')">Confirmar entrega</button>` : ''}
            ${['entregado','retirado'].includes(enc.estado) ? `<button class="btn btn-outline-secondary" onclick="verEvidenciasEntrega(${enc.id})">Ver evidencia</button>` : ''}
            ${tieneRol(['admin','supervisor']) ? `<button class="btn btn-outline-danger" onclick="anularEncomienda(${enc.id})">Anular</button>` : ''}
        </div></div></div>`;

        const avisoSensible = Number(enc.contenido_sensible) ? '<div class="alert alert-danger"><i class="fas fa-gem"></i> <strong>Contenido sensible:</strong> requiere revisión y aprobación de supervisor.</div>' : '';
        const html = `${guiaFlujo}<div class="card"><div class="card-header bg-primary text-white py-3"><small class="d-block text-uppercase opacity-75">Tracking ID único</small><h3 class="mb-0 text-white"><i class="fas fa-barcode me-2"></i>${enc.tracking_id}</h3></div><div class="card-body">${avisoSensible}
            <div class="row"><div class="col-md-6"><h6>Remitente</h6><p><strong>${enc.remitente_nombre}</strong><br>${enc.remitente_pais} - ${enc.remitente_telefono || ''}</p></div><div class="col-md-6"><h6>Destinatario</h6><p><strong>${enc.destinatario_nombre}</strong><br>${enc.destinatario_direccion}<br>${enc.destinatario_pais} - ${enc.destinatario_telefono || ''}</p></div></div>
            <h6>Contenido</h6><p>${enc.descripcion_items}</p><div class="row"><div class="col-md-6"><strong>Peso:</strong> ${enc.peso_kg} kg<br><strong>Cantidad:</strong> ${enc.cantidad_items}<br><strong>Costo:</strong> Q${enc.costo_quetzales}</div><div class="col-md-6"><strong>Estado:</strong> <span class="badge badge-estado-${enc.estado}">${enc.estado.replaceAll('_', ' ')}</span><br><strong>Tipo de entrega:</strong> ${enc.tipo_entrega.replaceAll('_', ' ')}<br><strong>Pagado:</strong> ${enc.pagado ? 'Sí' : 'No'}</div></div>
            </div></div>${accionesExtra}${controlesEstado}${controlesMaleta}<div class="card mt-3"><div class="card-body"><h6>Historial de trazabilidad</h6><ul class="list-group">${historial}</ul></div></div>`;
        mostrarModalDetalles('Detalles de Encomienda', html);
    } catch (error) {
        mostrarAlerta('danger', 'No se pudieron cargar los detalles: ' + error.message);
    }
};

async function cambiarEstadoEncomienda(encomiendaId) {
    const nuevoEstado = document.getElementById('detalle-nuevo-estado').value;
    const observacion = document.getElementById('detalle-observacion').value.trim();
    const response = await fetch(`${API_URL}/encomiendas.php?accion=actualizar_estado`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ encomienda_id: encomiendaId, nuevo_estado: nuevoEstado, observacion }) });
    const data = await response.json();
    if (!data.exito) return mostrarAlerta('danger', data.mensaje);
    bootstrap.Modal.getInstance(document.querySelector('.modal.show')).hide();
    mostrarAlerta('success', 'Estado actualizado correctamente');
    buscarEncomiendas(); cargarEstadisticas();
}

async function asignarEncomiendaAMaleta(encomiendaId) {
    const maletaId = Number(document.getElementById('detalle-maleta').value);
    const response = await fetch(`${API_URL}/maletas.php?accion=asignar_encomienda`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ encomienda_id: encomiendaId, maleta_id: maletaId }) });
    const data = await response.json();
    if (!data.exito) return mostrarAlerta('danger', data.mensaje);
    bootstrap.Modal.getInstance(document.querySelector('.modal.show')).hide();
    mostrarAlerta('success', data.mensaje); buscarEncomiendas(); cargarMaletasAbiertas();
}

// ===============================================
// MALETAS
// ===============================================

function crearMaleta(e) {
    e.preventDefault();
    
    const form = e.target;
    const formData = new FormData(form);
    const datos = {};
    
    formData.forEach((value, key) => {
        datos[key] = value;
    });
    
    datos.limite_peso_kg = parseFloat(datos.limite_peso_kg);
    
    fetch(`${API_URL}/maletas.php?accion=crear`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(datos)
    })
    .then(response => response.json())
    .then(data => {
        if (data.exito) {
            mostrarAlerta('success', `Maleta creada: ${data.datos.id_maleta}`);
            form.reset();
            cargarMaletasAbiertas();
        } else {
            mostrarAlerta('danger', 'Error: ' + data.mensaje);
        }
    })
    .catch(error => {
        mostrarAlerta('danger', 'Error: ' + error);
    });
}

function cargarMaletasAbiertas() {
    fetch(`${API_URL}/maletas.php?accion=listar`, { cache: 'no-store' })
        .then(response => response.json())
        .then(data => {
            if (data.exito && data.datos.length > 0) {
                const scannerSelect = document.getElementById('scanner-maleta');
                if (scannerSelect) scannerSelect.innerHTML = data.datos.filter(m => m.estado === 'abierta').map(m => `<option value="${m.id}">${m.id_maleta} - ${m.pais_destino}</option>`).join('');
                let html = '<div class="list-group">';
                
                data.datos.forEach(maleta => {
                    const porcentaje = (maleta.peso_actual / maleta.limite_peso_kg) * 100;
                    const clase_progreso = porcentaje > 90 ? 'bg-danger' : (porcentaje > 70 ? 'bg-warning' : 'bg-success');
                    
                    html += `<div class="list-group-item">
                        <div class="d-flex justify-content-between align-items-center">
                            <div>
                                <h6 class="mb-1">${maleta.id_maleta} <span class="badge bg-secondary">${maleta.estado}</span></h6>
                                <small class="text-muted">
                                    Responsable: ${maleta.responsable_nombre}<br>
                                    Vuelo/envío: ${maleta.vuelo_envio || 'No indicado'}<br>
                                    Destino: ${maleta.pais_destino} | 
                                    Paquetes: ${maleta.cantidad_paquetes || 0}
                                </small>
                            </div>
                            <div style="width: 150px;">
                                <small>${maleta.peso_actual}/${maleta.limite_peso_kg} kg</small>
                                <div class="progress" style="height: 20px;">
                                    <div class="progress-bar ${clase_progreso}" style="width: ${porcentaje}%"></div>
                                </div>
                                <button class="btn btn-sm btn-outline-primary mt-2 w-100" onclick="verContenidoMaleta(${maleta.id}, '${maleta.id_maleta}')">Ver paquetes</button>
                                <button class="btn btn-sm btn-outline-secondary mt-1 w-100" onclick="imprimirManifiesto(${maleta.id})">Manifiesto</button>
                                ${tieneRol(['admin', 'supervisor', 'bodega']) && maleta.estado === 'abierta' ? `<button class="btn btn-sm btn-outline-danger mt-1 w-100" onclick="cerrarMaleta(${maleta.id})">Cerrar maleta</button>` : ''}
                                ${tieneRol(['admin', 'supervisor', 'bodega']) && maleta.estado === 'cerrada' ? `<button class="btn btn-sm btn-outline-info mt-1 w-100" onclick="actualizarEstadoMaleta(${maleta.id},'enviada')">Marcar enviada</button>` : ''}
                                ${tieneRol(['admin', 'supervisor', 'bodega']) && maleta.estado === 'enviada' ? `<button class="btn btn-sm btn-outline-success mt-1 w-100" onclick="actualizarEstadoMaleta(${maleta.id},'recibida')">Confirmar recepción</button>` : ''}
                            </div>
                        </div>
                    </div>`;
                });
                
                html += '</div>';
                document.getElementById('lista-maletas-abiertas').innerHTML = html;
            } else {
                document.getElementById('lista-maletas-abiertas').innerHTML = 
                    '<div class="alert alert-info">No hay maletas registradas</div>';
            }
        });
}

async function verContenidoMaleta(maletaId, codigoMaleta) {
    try {
        const response = await fetch(`${API_URL}/maletas.php?accion=encomiendas&maleta_id=${maletaId}`, { cache: 'no-store' });
        const data = await response.json();
        if (!data.exito) throw new Error(data.mensaje);
        const puedeRetirar = tieneRol(['admin', 'supervisor', 'bodega']);
        const filas = data.datos.map(enc => `<tr><td>${enc.tracking_id}</td><td>${enc.destinatario_nombre}</td><td>${enc.peso_kg} kg</td><td><span class="badge badge-estado-${enc.estado}">${enc.estado.replaceAll('_', ' ')}</span></td><td>${puedeRetirar ? `<button class="btn btn-sm btn-danger" onclick="retirarEncomiendaDeMaleta(${maletaId}, ${enc.id})">Retirar</button>` : ''}</td></tr>`).join('');
        const html = filas ? `<div class="table-responsive"><table class="table"><thead><tr><th>Tracking</th><th>Destinatario</th><th>Peso</th><th>Estado</th><th>Acción</th></tr></thead><tbody>${filas}</tbody></table></div>` : '<div class="alert alert-info">Esta maleta todavía no contiene paquetes.</div>';
        mostrarModalDetalles(`Contenido de ${codigoMaleta}`, html);
    } catch (error) {
        mostrarAlerta('danger', error.message);
    }
}

async function retirarEncomiendaDeMaleta(maletaId, encomiendaId) {
    if (!confirm('¿Retirar esta encomienda de la maleta?')) return;
    const response = await fetch(`${API_URL}/maletas.php?accion=retirar_encomienda`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ maleta_id: maletaId, encomienda_id: encomiendaId }) });
    const data = await response.json();
    if (!data.exito) return mostrarAlerta('danger', data.mensaje);
    bootstrap.Modal.getInstance(document.querySelector('.modal.show')).hide();
    mostrarAlerta('success', data.mensaje); cargarMaletasAbiertas(); buscarEncomiendas();
}

async function cerrarMaleta(maletaId) {
    const peso = prompt('Peso real de la maleta en kg (deje vacío para usar la suma de paquetes):');
    if (peso === null) return;
    const pesoReal = peso.trim() === '' ? null : Number(peso);
    if (pesoReal !== null && (!Number.isFinite(pesoReal) || pesoReal <= 0)) return mostrarAlerta('warning', 'Ingrese un peso válido');
    const response = await fetch(`${API_URL}/maletas.php?accion=cerrar`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ maleta_id: maletaId, peso_real: pesoReal }) });
    const data = await response.json();
    if (!data.exito) return mostrarAlerta('danger', data.mensaje);
    mostrarAlerta('success', `${data.mensaje}. Paquetes: ${data.datos.cantidad_paquetes}`);
    cargarMaletasAbiertas(); buscarEncomiendas();
}

async function actualizarEstadoMaleta(maletaId, estado) {
    if (!confirm(`¿Cambiar la maleta al estado ${estado}?`)) return;
    const response = await fetch(`${API_URL}/maletas.php?accion=actualizar_estado`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({maleta_id:maletaId,estado}) });
    const data = await response.json();
    if (!data.exito) return mostrarAlerta('danger', data.mensaje);
    mostrarAlerta('success', data.mensaje); cargarMaletasAbiertas(); cargarEstadisticas(); buscarEncomiendas();
}

// ===============================================
// ESTADÍSTICAS
// ===============================================

function cargarEstadisticas() {
    Promise.all([
        fetch(`${API_URL}/encomiendas.php?accion=estadisticas`, { cache: 'no-store' }),
        fetch(`${API_URL}/maletas.php?accion=estadisticas`, { cache: 'no-store' })
    ])
        .then(responses => Promise.all(responses.map(response => response.json())))
        .then(([data, dataMaletas]) => {
            if (data.exito) {
                const stats = data.datos;
                
                // Actualizar tarjetas
                document.getElementById('stat-total').textContent = stats.total;
                document.getElementById('stat-entregadas').textContent = 
                    (stats.por_estado['entregado'] || 0) + (stats.por_estado['retirado'] || 0);
                document.getElementById('stat-proceso').textContent = 
                    stats.total - (stats.por_estado['entregado'] || 0) - (stats.por_estado['retirado'] || 0);
                document.getElementById('stat-incidencias').textContent = stats.por_estado['incidencia'] || 0;

                const estadosEncomienda = [
                    ['recibido', 'Recibidas', 'fa-inbox'],
                    ['en_revision', 'En revisión', 'fa-magnifying-glass'],
                    ['revisado', 'Revisadas', 'fa-magnifying-glass'],
                    ['aprobado', 'Aprobadas', 'fa-thumbs-up'],
                    ['observado', 'Observadas', 'fa-eye'],
                    ['empacado', 'Empacadas', 'fa-box'],
                    ['asignado_maleta', 'Asignadas a maleta', 'fa-suitcase'],
                    ['enviado', 'Enviadas', 'fa-plane-departure'],
                    ['recibido_destino', 'Recibidas en destino', 'fa-location-dot'],
                    ['en_ruta', 'En ruta', 'fa-truck'],
                    ['entregado', 'Entregadas', 'fa-circle-check'],
                    ['listo_retiro', 'Listas para retiro', 'fa-store'],
                    ['retirado', 'Retiradas', 'fa-hand-holding-box'],
                    ['incidencia', 'Con incidencia', 'fa-triangle-exclamation'],
                    ['anulado', 'Anuladas', 'fa-ban']
                ];
                document.getElementById('dashboard-estados-encomiendas').innerHTML = estadosEncomienda.map(([clave, nombre, icono]) => `
                    <div class="col-6 col-md-4 col-xl-3"><div class="card h-100 border-0 bg-light"><div class="card-body text-center">
                        <i class="fas ${icono} fa-lg text-primary mb-2"></i><h3 class="mb-1">${stats.por_estado[clave] || 0}</h3><small>${nombre}</small>
                    </div></div></div>`).join('');

                const estadosMaleta = [
                    ['abierta', 'Abiertas', 'fa-lock-open'],
                    ['cerrada', 'Cerradas', 'fa-lock'],
                    ['enviada', 'Enviadas', 'fa-plane'],
                    ['recibida', 'Recibidas', 'fa-clipboard-check']
                ];
                const statsMaletas = dataMaletas.exito ? dataMaletas.datos : { total: 0, por_estado: {} };
                document.getElementById('dashboard-estados-maletas').innerHTML = estadosMaleta.map(([clave, nombre, icono]) => `
                    <div class="col-6 col-md-3"><div class="card h-100 border-0 bg-light"><div class="card-body text-center">
                        <i class="fas ${icono} fa-lg text-success mb-2"></i><h3 class="mb-1">${statsMaletas.por_estado[clave] || 0}</h3><small>${nombre}</small>
                    </div></div></div>`).join('');
                
                // Mostrar KPIs
                let html = `<div class="row">`;
                html += `<div class="col-md-6">
                    <h6>Total de Encomiendas</h6>
                    <h3>${stats.total}</h3>
                </div>`;
                html += `<div class="col-md-6">
                    <h6>Tiempo Promedio de Entrega</h6>
                    <h3>${Math.round(stats.tiempo_promedio_horas || 0)} horas</h3>
                </div>`;
                html += `</div>`;
                
                html += `<div class="row mt-4">
                    <div class="col-12">
                        <h6>Por Estado</h6>
                        <table class="table table-sm">
                            <tbody>`;
                
                for (let [estado, cantidad] of Object.entries(stats.por_estado)) {
                    const porcentaje = ((cantidad / stats.total) * 100).toFixed(1);
                    html += `<tr>
                        <td><span class="badge badge-estado-${estado}">${estado}</span></td>
                        <td>${cantidad}</td>
                        <td>${porcentaje}%</td>
                    </tr>`;
                }
                
                html += `</tbody></table>
                    </div>
                </div>`;
                
                document.getElementById('kpis-container').innerHTML = html;
            }
        });
}

// ===============================================
// UTILIDADES
// ===============================================

function generarQR(tracking_id) {
    const container = document.createElement('div');
    container.className = 'qr-container mt-3';
    container.innerHTML = `<p>QR para: <strong>${tracking_id}</strong></p><div id="qrcode"></div>`;
    
    const form = document.getElementById('form-nueva-encomienda');
    form.parentElement.insertBefore(container, form.nextSibling);
    
    // Generar QR
    new QRCode(container.querySelector('#qrcode'), {
        text: tracking_id,
        width: 200,
        height: 200,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.H
    });
}

function mostrarAlerta(tipo, mensaje) {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${tipo} alert-dismissible fade show fade-in`;
    alertDiv.setAttribute('role', 'alert');
    alertDiv.style.cssText = 'position:fixed;top:24px;right:24px;z-index:1100;max-width:460px;box-shadow:0 16px 40px rgba(15,23,42,.22);';
    alertDiv.innerHTML = `
        ${mensaje}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;

    document.body.appendChild(alertDiv);
    
    // Desaparecer después de 5 segundos
    setTimeout(() => {
        alertDiv.remove();
    }, 5000);
}

function mostrarModalDetalles(titulo, contenido) {
    const modal = document.createElement('div');
    modal.className = 'modal fade';
    modal.innerHTML = `
        <div class="modal-dialog modal-lg">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">${titulo}</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    ${contenido}
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();
    
    // Remover modal del DOM cuando se cierre
    modal.addEventListener('hidden.bs.modal', () => {
        modal.remove();
    });
}
