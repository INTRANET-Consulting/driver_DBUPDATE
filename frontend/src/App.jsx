import React, { useState, useEffect } from 'react';
import { Calendar, Upload, Users, MapPin, Clock, AlertCircle, CheckCircle, Edit2, Save, X, RefreshCw, Trash2, Plus } from 'lucide-react';

const API_BASE_URL = 'http://localhost:8000/api/v1';

const DriverSchedulingSystem = () => {
  const [activeTab, setActiveTab] = useState('upload');
  const [weekStart, setWeekStart] = useState('');
  const [file, setFile] = useState(null);
  const [action, setAction] = useState('replace');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  
  const [drivers, setDrivers] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [availability, setAvailability] = useState([]);
  const [fixedAssignments, setFixedAssignments] = useState([]);
  const [summary, setSummary] = useState(null);
  
  const [editingDriver, setEditingDriver] = useState(null);
  const [editingRoute, setEditingRoute] = useState(null);
  const [editingAvailability, setEditingAvailability] = useState(null);

  const validateMonday = (dateString) => {
    if (!dateString) return false;
    const date = new Date(dateString);
    return date.getDay() === 1;
  };

  const getNearestMondays = (dateString) => {
    const date = new Date(dateString);
    const dayOfWeek = date.getDay();
    const daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const previousMonday = new Date(date);
    previousMonday.setDate(date.getDate() - daysToSubtract);
    
    const nextMonday = new Date(previousMonday);
    nextMonday.setDate(previousMonday.getDate() + 7);
    
    return {
      previous: previousMonday.toISOString().split('T')[0],
      next: nextMonday.toISOString().split('T')[0]
    };
  };

  const handleFileUpload = async () => {
    if (!file) {
      setMessage({ type: 'error', text: 'Please select a file' });
      return;
    }
    
    if (!weekStart) {
      setMessage({ type: 'error', text: 'Please select a week start date' });
      return;
    }
    
    if (!validateMonday(weekStart)) {
      const mondays = getNearestMondays(weekStart);
      const selectedDate = new Date(weekStart);
      const dayName = selectedDate.toLocaleDateString('en-US', { weekday: 'long' });
      
      setMessage({
        type: 'error',
        text: `The date ${weekStart} is a ${dayName}, not a Monday!`,
        suggestions: {
          previous: mondays.previous,
          next: mondays.next
        }
      });
      return;
    }
    
    setLoading(true);
    setMessage(null);
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('week_start', weekStart);
    formData.append('action', action);
    formData.append('unavailable_drivers', '[]');
    
    try {
      const response = await fetch(`${API_BASE_URL}/upload/weekly-plan`, {
        method: 'POST',
        body: formData,
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        if (data.detail && data.detail.error) {
          setMessage({
            type: 'error',
            text: data.detail.message,
            suggestions: data.detail.suggestions
          });
        } else {
          throw new Error(data.detail || 'Upload failed');
        }
      } else {
        setMessage({
          type: 'success',
          text: `✅ Upload successful! Created ${data.records_created.drivers} drivers, ${data.records_created.routes} routes, ${data.records_created.fixed_assignments} fixed assignments.`
        });
        
        fetchWeeklyData(weekStart);
      }
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setLoading(false);
    }
  };

  const fetchWeeklyData = async (date) => {
    if (!date || !validateMonday(date)) return;
    
    setLoading(true);
    try {
      const [driversRes, routesRes, availRes, assignRes, summaryRes] = await Promise.all([
        fetch(`${API_BASE_URL}/weekly/drivers?week_start=${date}`),
        fetch(`${API_BASE_URL}/weekly/routes?week_start=${date}`),
        fetch(`${API_BASE_URL}/weekly/availability?week_start=${date}`),
        fetch(`${API_BASE_URL}/weekly/fixed-assignments?week_start=${date}`),
        fetch(`${API_BASE_URL}/weekly/summary?week_start=${date}`)
      ]);
      
      const [driversData, routesData, availData, assignData, summaryData] = await Promise.all([
        driversRes.json(),
        routesRes.json(),
        availRes.json(),
        assignRes.json(),
        summaryRes.json()
      ]);
      
      setDrivers(driversData.drivers || []);
      setRoutes(routesData.routes || []);
      setAvailability(availData.availability || []);
      setFixedAssignments(assignData.fixed_assignments || []);
      setSummary(summaryData);
      
      setMessage({ type: 'success', text: 'Data loaded successfully' });
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to load data: ' + error.message });
    } finally {
      setLoading(false);
    }
  };

  const updateDriver = async (driverId, updatedDetails) => {
    try {
      setDrivers(drivers.map(d => 
        d.driver_id === driverId 
          ? { ...d, details: { ...d.details, ...updatedDetails } }
          : d
      ));
      setEditingDriver(null);
      setMessage({ type: 'success', text: 'Driver updated successfully' });
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to update driver' });
    }
  };

  const updateAvailability = async (availId, updatedData) => {
    try {
      setAvailability(availability.map(a => 
        a.id === availId 
          ? { ...a, ...updatedData }
          : a
      ));
      setEditingAvailability(null);
      setMessage({ type: 'success', text: 'Availability updated successfully' });
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to update availability' });
    }
  };

  const UploadTab = () => (
    <div style={{
      backgroundColor: 'white',
      borderRadius: '8px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      padding: '24px',
      maxWidth: '800px',
      margin: '0 auto'
    }}>
      <h2 style={{
        fontSize: '24px',
        fontWeight: 'bold',
        marginBottom: '24px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
      }}>
        <Upload size={24} />
        Upload Weekly Plan
      </h2>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '8px' }}>
            Excel File (.xlsx, .xls, .xlsm)
          </label>
          <input
            type="file"
            accept=".xlsx,.xls,.xlsm"
            onChange={(e) => setFile(e.target.files[0])}
            style={{
              display: 'block',
              width: '100%',
              padding: '8px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px'
            }}
          />
          {file && (
            <p style={{ marginTop: '8px', fontSize: '14px', color: '#059669' }}>
              Selected: {file.name}
            </p>
          )}
        </div>
        
        <div>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '8px' }}>
            Week Start Date (Must be Monday)
          </label>
          <input
            type="date"
            value={weekStart}
            onChange={(e) => setWeekStart(e.target.value)}
            style={{
              display: 'block',
              width: '100%',
              padding: '10px 16px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px'
            }}
          />
          {weekStart && !validateMonday(weekStart) && (
            <p style={{ marginTop: '8px', fontSize: '14px', color: '#d97706', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <AlertCircle size={16} />
              Warning: Selected date is not a Monday
            </p>
          )}
          {weekStart && validateMonday(weekStart) && (
            <p style={{ marginTop: '8px', fontSize: '14px', color: '#059669', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <CheckCircle size={16} />
              Valid Monday selected
            </p>
          )}
        </div>
        
        <div>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '8px' }}>
            Action
          </label>
          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            style={{
              display: 'block',
              width: '100%',
              padding: '10px 16px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px'
            }}
          >
            <option value="replace">Replace (Clear old data for this week)</option>
            <option value="append">Append (Keep old data)</option>
          </select>
        </div>
        
        <button
          onClick={handleFileUpload}
          disabled={loading || !file || !weekStart}
          style={{
            width: '100%',
            backgroundColor: loading || !file || !weekStart ? '#9ca3af' : '#2563eb',
            color: 'white',
            padding: '12px 16px',
            borderRadius: '6px',
            fontWeight: '600',
            border: 'none',
            cursor: loading || !file || !weekStart ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            fontSize: '16px'
          }}
        >
          {loading ? (
            <>
              <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite' }} />
              Uploading...
            </>
          ) : (
            <>
              <Upload size={20} />
              Upload and Process
            </>
          )}
        </button>
      </div>
      
      {message && (
        <div style={{
          marginTop: '24px',
          padding: '16px',
          borderRadius: '8px',
          backgroundColor: message.type === 'success' ? '#ecfdf5' : '#fef2f2',
          border: `1px solid ${message.type === 'success' ? '#86efac' : '#fca5a5'}`
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
            {message.type === 'success' ? (
              <CheckCircle size={20} style={{ color: '#059669', flexShrink: 0 }} />
            ) : (
              <AlertCircle size={20} style={{ color: '#dc2626', flexShrink: 0 }} />
            )}
            <div style={{ flex: 1 }}>
              <p style={{ color: message.type === 'success' ? '#065f46' : '#991b1b' }}>
                {message.text}
              </p>
              {message.suggestions && (
                <div style={{ marginTop: '12px' }}>
                  <p style={{ fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '8px' }}>
                    Use one of these Mondays instead:
                  </p>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      onClick={() => setWeekStart(message.suggestions.previous)}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: '#dbeafe',
                        color: '#1e40af',
                        borderRadius: '4px',
                        fontSize: '14px',
                        border: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      {message.suggestions.previous} (Previous Monday)
                    </button>
                    <button
                      onClick={() => setWeekStart(message.suggestions.next)}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: '#dbeafe',
                        color: '#1e40af',
                        borderRadius: '4px',
                        fontSize: '14px',
                        border: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      {message.suggestions.next} (Next Monday)
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const DriversTab = () => (
    <div style={{
      backgroundColor: 'white',
      borderRadius: '8px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      padding: '24px'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Users size={24} />
          Drivers ({drivers.length})
        </h2>
        <button
          onClick={() => fetchWeeklyData(weekStart)}
          disabled={!weekStart || loading}
          style={{
            padding: '8px 16px',
            backgroundColor: '#f3f4f6',
            borderRadius: '6px',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            opacity: !weekStart || loading ? 0.5 : 1
          }}
        >
          <RefreshCw size={16} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          Refresh
        </button>
      </div>
      
      {drivers.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: '#6b7280' }}>
          <Users size={64} style={{ margin: '0 auto 16px', opacity: 0.5 }} />
          <p>No drivers found. Upload a weekly plan to get started.</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f9fafb' }}>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '500', color: '#6b7280', textTransform: 'uppercase' }}>Name</th>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '500', color: '#6b7280', textTransform: 'uppercase' }}>Type</th>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '500', color: '#6b7280', textTransform: 'uppercase' }}>Employment %</th>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '500', color: '#6b7280', textTransform: 'uppercase' }}>Target Hours</th>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '500', color: '#6b7280', textTransform: 'uppercase' }}>Worked</th>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '500', color: '#6b7280', textTransform: 'uppercase' }}>Remaining</th>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '500', color: '#6b7280', textTransform: 'uppercase' }}>Fixed (mS)</th>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '500', color: '#6b7280', textTransform: 'uppercase' }}>Fixed (oS)</th>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '500', color: '#6b7280', textTransform: 'uppercase' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {drivers.map((driver, idx) => (
                <tr key={driver.driver_id} style={{ borderTop: '1px solid #e5e7eb', backgroundColor: idx % 2 === 0 ? 'white' : '#f9fafb' }}>
                  <td style={{ padding: '16px', fontWeight: '500' }}>{driver.name}</td>
                  <td style={{ padding: '16px' }}>
                    <span style={{
                      padding: '4px 8px',
                      fontSize: '12px',
                      borderRadius: '12px',
                      backgroundColor: driver.details.type === 'full_time' ? '#d1fae5' : driver.details.type === 'reduced_hours' ? '#dbeafe' : '#f3f4f6',
                      color: driver.details.type === 'full_time' ? '#065f46' : driver.details.type === 'reduced_hours' ? '#1e40af' : '#374151'
                    }}>
                      {driver.details.type?.replace('_', ' ') || 'N/A'}
                    </span>
                  </td>
                  <td style={{ padding: '16px' }}>{driver.details.employment_percentage || 'N/A'}%</td>
                  <td style={{ padding: '16px' }}>{driver.details.monthly_hours_target || 'N/A'}</td>
                  <td style={{ padding: '16px' }}>{driver.details.monthly_hours_worked || 'N/A'}</td>
                  <td style={{ padding: '16px', color: '#059669', fontWeight: '500' }}>
                    {driver.details.monthly_hours_remaining || 'N/A'}
                  </td>
                  <td style={{ padding: '16px' }}>{driver.details.fixed_route_with_school || '-'}</td>
                  <td style={{ padding: '16px' }}>{driver.details.fixed_route_without_school || '-'}</td>
                  <td style={{ padding: '16px' }}>
                    <button style={{ color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer' }}>
                      <Edit2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  const RoutesTab = () => {
    const groupedRoutes = routes.reduce((acc, route) => {
      const date = route.date;
      if (!acc[date]) acc[date] = [];
      acc[date].push(route);
      return acc;
    }, {});

    return (
      <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '24px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <MapPin size={24} />
            Routes ({routes.length})
          </h2>
          <button
            onClick={() => fetchWeeklyData(weekStart)}
            disabled={!weekStart || loading}
            style={{
              padding: '8px 16px',
              backgroundColor: '#f3f4f6',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>
        
        {routes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 0', color: '#6b7280' }}>
            <MapPin size={64} style={{ margin: '0 auto 16px', opacity: 0.5 }} />
            <p>No routes found. Upload a weekly plan to get started.</p>
          </div>
        ) : (
          <div>
            {Object.entries(groupedRoutes).sort().map(([date, dayRoutes]) => (
              <div key={date} style={{ marginBottom: '24px', padding: '16px', border: '1px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#f9fafb' }}>
                <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Calendar size={20} />
                  {new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                  <span style={{ fontSize: '14px', color: '#6b7280', fontWeight: 'normal' }}>({dayRoutes.length} routes)</span>
                </h3>
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
                  {dayRoutes.map((route) => (
                    <div key={route.route_id} style={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                        <span style={{ fontWeight: '600', color: '#1e40af' }}>{route.route_name}</span>
                        <span style={{
                          padding: '2px 8px',
                          fontSize: '11px',
                          borderRadius: '4px',
                          backgroundColor: route.details.type === 'regular' ? '#d1fae5' : route.details.type === 'saturday' ? '#e0e7ff' : '#fed7aa',
                          color: route.details.type === 'regular' ? '#065f46' : route.details.type === 'saturday' ? '#3730a3' : '#9a3412'
                        }}>
                          {route.details.type}
                        </span>
                      </div>
                      <div style={{ fontSize: '14px', color: '#6b7280' }}>
                        {route.details.vad_time && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                            <Clock size={14} />
                            VAD: {route.details.vad_time}
                          </div>
                        )}
                        {route.details.diaten && <div>Diäten: {route.details.diaten}h</div>}
                        {route.details.location && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <MapPin size={14} />
                            {route.details.location}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f3f4f6' }}>
      <div style={{ background: 'linear-gradient(to right, #2563eb, #1e40af, #3730a3)', color: 'white', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '24px 16px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: 'bold' }}>
            🚌 Driver Scheduling Management System
          </h1>
          <p style={{ color: '#bfdbfe', marginTop: '4px' }}>Professional weekly planning and route management</p>
        </div>
      </div>

      <div style={{ backgroundColor: 'white', borderBottom: '1px solid #e5e7eb', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 16px' }}>
          <div style={{ display: 'flex', gap: '4px', overflowX: 'auto' }}>
            {[
              { id: 'upload', label: 'Upload', icon: Upload },
              { id: 'drivers', label: 'Drivers', icon: Users },
              { id: 'routes', label: 'Routes', icon: MapPin },
              { id: 'availability', label: 'Availability', icon: Clock },
              { id: 'assignments', label: 'Fixed Assignments', icon: CheckCircle }
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => {
                  setActiveTab(id);
                  if (id !== 'upload' && weekStart && validateMonday(weekStart)) {
                    fetchWeeklyData(weekStart);
                  }
                }}
                style={{
                  padding: '16px 24px',
                  fontWeight: '500',
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  whiteSpace: 'nowrap',
                  color: activeTab === id ? '#2563eb' : '#6b7280',
                  borderBottom: activeTab === id ? '2px solid #2563eb' : '2px solid transparent',
                  backgroundColor: activeTab === id ? '#eff6ff' : 'transparent'
                }}
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '32px 16px' }}>
        {activeTab !== 'upload' && (
          <div style={{ marginBottom: '24px', backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
              <label style={{ fontSize: '14px', fontWeight: '500', color: '#374151' }}>
                Week Start (Monday):
              </label>
              <input
                type="date"
                value={weekStart}
                onChange={(e) => {
                  setWeekStart(e.target.value);
                  if (validateMonday(e.target.value)) {
                    fetchWeeklyData(e.target.value);
                  }
                }}
                style={{ padding: '8px 16px', border: '1px solid #d1d5db', borderRadius: '6px' }}
              />
              {weekStart && !validateMonday(weekStart) && (
                <span style={{ fontSize: '14px', color: '#dc2626', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <AlertCircle size={16} />
                  Please select a Monday
                </span>
              )}
              {weekStart && validateMonday(weekStart) && (
                <span style={{ fontSize: '14px', color: '#059669', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <CheckCircle size={16} />
                  Valid week selected
                </span>
              )}
            </div>
          </div>
        )}

        <div>
          {activeTab === 'upload' && <UploadTab />}
          {activeTab === 'drivers' && <DriversTab />}
          {activeTab === 'routes' && <RoutesTab />}
        </div>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default DriverSchedulingSystem;