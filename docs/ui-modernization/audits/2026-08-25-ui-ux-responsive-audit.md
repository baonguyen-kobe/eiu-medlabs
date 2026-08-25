 === EIU MEDLABS UI/UX + RESPONSIVE AUDIT ===

 1. EXECUTIVE SUMMARY

 - Overall UI maturity: 3/5 — functional and deliberately branded, with a strong desktop foundation. The application is not a greenfield redesign candidate.
 - Design-system maturity: 3/5. A detailed, approved UI Master exists and many production styles implement it. The main weakness is implementation
   fragmentation: a 11,600-line global stylesheet, two overlapping token layers, repeated selectors, and several page-local UI systems.
 - Mobile readiness: Mixed. The shared shell, calendars, forms, drawers, and local table scrolling have intentional mobile rules. The rendered password
   recovery/reset screens are visibly broken, some dense workflows remain desktop-table-first, and touch targets are inconsistent.                             
 - Accessibility maturity: 2/5. Strong fundamentals exist, but required signature workflows are pointer-only and several custom overlays, comboboxes, filters, 
   and repeated-row form controls have keyboard or naming gaps.                                                                                                
 - Component architecture: Mixed. Strong centralized shell, icon, confirmation, pagination, and domain components; weak reusable foundations for tables, form  
   fields, overlays, statuses, and asynchronous states.                                                                                                        
 - Main strength: The approved MedLabs identity is coherent: EIU blue/gold/cream, Be Vietnam Pro, dense operational layouts, recognizable cards, and           
   centralized navigation.                                                                                                                                     
 - Main weakness: The implementation contains a modern V2 layer appended over extensive legacy CSS rather than a clean consolidated contract.                  
 - Highest-impact opportunity: Preserve the current appearance while consolidating shared primitives, fixing inaccessible core interactions, and defining      
   intentional mobile strategies for high-value tables and forms.                                                                                              
 - Major redesign needed: No.                                                                                                                                  
 - Significant consolidation and responsive work needed: Yes.                                                                                                  
                                                                                                                                                               
 ────────────────────────────────────────────────────────────────────────────────                                                                              
                                                                                                                                                               
 2. APPLICATION UI MAP                                                                                                                                         
                                                                                                                                                               
 ### Routes/screens                                                                                                                                            
                                                                                                                                                               
 The App Router contains 32 page.tsx routes: 29 rendered screens and 3 redirects/aliases.                                                                      
                                                                                                                                                               
 ┌──────────────────────────────────────┬───────────────────────────┬───────────────────────────────────────┬────────────────────────────┬───────────────────┐ 
 │ Route                                │ Purpose                   │ Layout / primary components           │ Interaction and access     │ Mobile complexity │ 
 ├──────────────────────────────────────┼───────────────────────────┼───────────────────────────────────────┼────────────────────────────┼───────────────────┤ 
 │ /                                    │ Entry alias               │ Redirect only                         │ Redirects to /dashboard    │ None              │ 
 ├──────────────────────────────────────┼───────────────────────────┼───────────────────────────────────────┼────────────────────────────┼───────────────────┤ 
 │ /login                               │ Authentication            │ Dedicated branded auth layout;        │ Public; password and       │ Medium; rendered  │ 
 │                                      │                           │ LoginForm                             │ Google login               │ at all 4 widths   │ 
 ├──────────────────────────────────────┼───────────────────────────┼───────────────────────────────────────┼────────────────────────────┼───────────────────┤ 
 │ /forgot-password                     │ Password recovery request │ Legacy login-page + login-card;       │ Public form                │ High; rendered    │ 
 │                                      │                           │ ForgotPasswordForm                    │                            │ layout is broken  │ 
 ├──────────────────────────────────────┼───────────────────────────┼───────────────────────────────────────┼────────────────────────────┼───────────────────┤ 
 │ /reset-password                      │ Set recovered password    │ Legacy auth card; PasswordChangeForm  │ Public/recovery session    │ High; rendered    │ 
 │                                      │                           │                                       │                            │ layout is broken  │ 
 ├──────────────────────────────────────┼───────────────────────────┼───────────────────────────────────────┼────────────────────────────┼───────────────────┤ 
 │ /change-password                     │ Forced password change    │ Legacy auth card; PasswordChangeForm  │ Authenticated/forced flow  │ High; same shell  │ 
 │                                      │                           │                                       │                            │ problem           │ 
 ├──────────────────────────────────────┼───────────────────────────┼───────────────────────────────────────┼────────────────────────────┼───────────────────┤ 
 │ /dashboard                           │ Operational overview      │ WorkspaceShell; KPI cards; upcoming   │ Authenticated Skills       │ Medium            │ 
 │                                      │                           │ schedule table                        │ workspace                  │                   │ 
 ├──────────────────────────────────────┼───────────────────────────┼───────────────────────────────────────┼────────────────────────────┼───────────────────┤ 
 │ /class-schedules                     │ Skills calendar           │ Shared Dashboard calendar component   │ Authenticated,             │ High              │ 
 │                                      │                           │                                       │ capability-gated           │                   │ 
 ├──────────────────────────────────────┼───────────────────────────┼───────────────────────────────────────┼────────────────────────────┼───────────────────┤ 
 │ /staff-shifts                        │ Shift roster and          │ WorkspaceShell; StaffShiftRoster      │ Admin/staff/eligible users │ Very high         │ 
 │                                      │ registration              │                                       │                            │                   │ 
 ├──────────────────────────────────────┼───────────────────────────┼───────────────────────────────────────┼────────────────────────────┼───────────────────┤ 
 │ /schedule-entry/new                  │ Create Skills schedule    │ ScheduleForm                          │ Capability-gated           │ Medium            │ 
 ├──────────────────────────────────────┼───────────────────────────┼───────────────────────────────────────┼────────────────────────────┼───────────────────┤ 
 │ /schedule-entry/import               │ Import Skills schedules   │ ImportWizard                          │ Import permission          │ High              │ 
 ├──────────────────────────────────────┼───────────────────────────┼───────────────────────────────────────┼────────────────────────────┼───────────────────┤ 
 │ /imports                             │ Import history            │ Data table and pagination             │ Import-capable users       │ High              │ 
 ├──────────────────────────────────────┼───────────────────────────┼───────────────────────────────────────┼────────────────────────────┼───────────────────┤ 
 │ /classes/open                        │ Available classes         │ ClassRegistrationList                 │ Skills scope               │ High              │ 
 ├──────────────────────────────────────┼───────────────────────────┼───────────────────────────────────────┼────────────────────────────┼───────────────────┤ 
 │ /classes/mine                        │ Lecturer-owned classes    │ ClassRegistrationList                 │ Lecturer + Skills scope    │ High              │ 
 ├──────────────────────────────────────┼───────────────────────────┼───────────────────────────────────────┼────────────────────────────┼───────────────────┤ 
 │ /equipment/register                  │ Skills equipment request  │ EquipmentRequestForm                  │ Skills scope/capability    │ Very high         │ 
 ├──────────────────────────────────────┼───────────────────────────┼───────────────────────────────────────┼────────────────────────────┼───────────────────┤ 
 │ /equipment/requests                  │ Unified equipment         │ EquipmentRequestList                  │ Admin/staff operational    │ Very high         │ 
 │                                      │ operations                │                                       │ scope                      │                   │ 
 ├──────────────────────────────────────┼───────────────────────────┼───────────────────────────────────────┼────────────────────────────┼───────────────────┤ 
 │ /equipment/import                    │ Import equipment requests │ EquipmentImportWizard                 │ Admin/staff                │ High              │ 
 ├──────────────────────────────────────┼───────────────────────────┼───────────────────────────────────────┼────────────────────────────┼───────────────────┤ 
 │ /equipment/mine                      │ User’s equipment requests │ EquipmentRequestList                  │ Skills scope               │ Very high         │ 
 ├──────────────────────────────────────┼───────────────────────────┼───────────────────────────────────────┼────────────────────────────┼───────────────────┤ 
 │ /basic-medical/schedules             │ Basic Medical calendar    │ Shared Dashboard calendar component   │ Basic Medical scope        │ High              │ 
 ├──────────────────────────────────────┼───────────────────────────┼───────────────────────────────────────┼────────────────────────────┼───────────────────┤ 
 │ /basic-medical/new                   │ Create/edit/copy Basic    │ BasicMedicalRegistrationForm          │ Basic Medical access       │ Very high         │ 
 │                                      │ Medical registration      │                                       │                            │                   │ 
 ├──────────────────────────────────────┼───────────────────────────┼───────────────────────────────────────┼────────────────────────────┼───────────────────┤ 
 │ /basic-medical/registrations         │ Registration and session  │ BasicMedicalRegistrationList          │ Scope and management       │ Very high         │ 
 │                                      │ management                │                                       │ permissions                │                   │ 
 ├──────────────────────────────────────┼───────────────────────────┼───────────────────────────────────────┼────────────────────────────┼───────────────────┤ 
 │ /basic-medical/registrations/confirm │ Confirmation evidence     │ Document layout and condition table   │ Scope-gated; notFound()    │ Medium            │ 
 │ ations/[id]                          │ document                  │                                       │ when unauthorized          │                   │ 
 ├──────────────────────────────────────┼───────────────────────────┼───────────────────────────────────────┼────────────────────────────┼───────────────────┤ 
 │ /basic-medical/import                │ Import Basic Medical      │ Shared ImportWizard                   │ Import capability          │ High              │ 
 │                                      │ schedules                 │                                       │                            │                   │ 
 ├──────────────────────────────────────┼───────────────────────────┼───────────────────────────────────────┼────────────────────────────┼───────────────────┤ 
 │ /basic-medical/equipment             │ Catalog, room inventory,  │ BasicMedicalEquipmentManager          │ View/manage capability     │ Very high         │ 
 │                                      │ damage, logs              │                                       │                            │                   │ 
 ├──────────────────────────────────────┼───────────────────────────┼───────────────────────────────────────┼────────────────────────────┼───────────────────┤ 
 │ /basic-medical/equipment-requests    │ Basic Medical equipment   │ BasicMedicalEquipmentRegistrationPage │ Capability-gated           │ Very high         │ 
 │                                      │ request workspace         │                                       │                            │                   │ 
 ├──────────────────────────────────────┼───────────────────────────┼───────────────────────────────────────┼────────────────────────────┼───────────────────┤ 
 │ /admin/personnel                     │ Personnel and permissions │ AdminShell; PersonnelManagementList   │ Personnel manager/root     │ Very high         │ 
 │                                      │                           │                                       │ administrator              │                   │ 
 ├──────────────────────────────────────┼───────────────────────────┼───────────────────────────────────────┼────────────────────────────┼───────────────────┤ 
 │ /admin/equipment                     │ Skills equipment catalog  │ EquipmentCatalogManager               │ Admin/staff                │ Very high         │ 
 ├──────────────────────────────────────┼───────────────────────────┼───────────────────────────────────────┼────────────────────────────┼───────────────────┤ 
 │ /admin/catalogs                      │ Catalog alias             │ Redirect only                         │ Admin; redirects to        │ None              │ 
 │                                      │                           │                                       │ /admin/courses             │                   │ 
 ├──────────────────────────────────────┼───────────────────────────┼───────────────────────────────────────┼────────────────────────────┼───────────────────┤ 
 │ /admin/courses                       │ Course catalog            │ CatalogBatchManager                   │ Admin only                 │ High              │ 
 ├──────────────────────────────────────┼───────────────────────────┼───────────────────────────────────────┼────────────────────────────┼───────────────────┤ 
 │ /admin/rooms                         │ Room and room-type        │ CatalogBatchManager plus room-type    │ Admin only                 │ High              │ 
 │                                      │ catalog                   │ table                                 │                            │                   │ 
 ├──────────────────────────────────────┼───────────────────────────┼───────────────────────────────────────┼────────────────────────────┼───────────────────┤ 
 │ /admin/class-schedules               │ Legacy alias              │ Redirect only                         │ Redirects to /classes/open │ None              │ 
 ├──────────────────────────────────────┼───────────────────────────┼───────────────────────────────────────┼────────────────────────────┼───────────────────┤ 
 │ /admin/audit                         │ Audit log                 │ Table and URL pagination              │ Admin only                 │ High              │ 
 ├──────────────────────────────────────┼───────────────────────────┼───────────────────────────────────────┼────────────────────────────┼───────────────────┤ 
 │ /email-notifications                 │ Delivery controls and log │ EmailNotificationTable                │ Notification manager       │ High              │ 
 └──────────────────────────────────────┴───────────────────────────┴───────────────────────────────────────┴────────────────────────────┴───────────────────┘ 
                                                                                                                                                               
 ### Shared layouts                                                                                                                                            
                                                                                                                                                               
 - app/layout.tsx                                                                                                                                              
   - lang="vi".                                                                                                                                                
   - Be Vietnam Pro weights 400–800.                                                                                                                           
   - Skip link and #main-content.                                                                                                                              
   - Global theme color.                                                                                                                                       
 - WorkspaceShell — 21 direct consumers                                                                                                                        
   - Central sidebar, role-aware navigation, account actions, mobile drawer, shared page header, notification bell.                                            
 - PageHeader                                                                                                                                                  
   - One semantic <h1>, title, description, menu and action slots.                                                                                             
 - AdminShell                                                                                                                                                  
   - Thin wrapper over WorkspaceShell; preserves one navigation system.                                                                                        
 - Dedicated /login shell                                                                                                                                      
   - Campus image, EIU logo, branded form panel.                                                                                                               
 - Legacy recovery/reset shell                                                                                                                                 
   - Reuses class names but does not match the current login DOM contract.                                                                                     
                                                                                                                                                               
 ### Shared components                                                                                                                                         
                                                                                                                                                               
 #### Navigation                                                                                                                                               
                                                                                                                                                               
 - WorkspaceShell                                                                                                                                              
 - PageHeader                                                                                                                                                  
 - AdminShell                                                                                                                                                  
 - CatalogTabs                                                                                                                                                 
 - NotificationBell                                                                                                                                            
 - PaginationLinks                                                                                                                                             
 - PaginationControls                                                                                                                                          
                                                                                                                                                               
 #### Layout and containers                                                                                                                                    
                                                                                                                                                               
 - CSS-based page-container, data-panel, catalog-data-panel, calendar-card, overview-panel.                                                                    
 - No shared React Card, Panel, DataTableShell, or TableScrollViewport component.                                                                              
                                                                                                                                                               
 #### Forms and inputs                                                                                                                                         
                                                                                                                                                               
 - ScheduleForm                                                                                                                                                
 - BasicMedicalRegistrationForm                                                                                                                                
 - EquipmentRequestForm                                                                                                                                        
 - BasicMedicalEquipmentRequestForm                                                                                                                            
 - SearchableCombobox                                                                                                                                          
 - TimePicker                                                                                                                                                  
 - PasswordChangeForm                                                                                                                                          
 - ForgotPasswordForm                                                                                                                                          
 - PersonnelBasicMedicalPermissionField                                                                                                                        
                                                                                                                                                               
 #### Tables and lists                                                                                                                                         
                                                                                                                                                               
 - ClassRegistrationList                                                                                                                                       
 - EquipmentRequestList                                                                                                                                        
 - EquipmentCatalogManager                                                                                                                                     
 - BasicMedicalEquipmentManager                                                                                                                                
 - BasicMedicalRegistrationList                                                                                                                                
 - PersonnelManagementList                                                                                                                                     
 - EmailNotificationTable                                                                                                                                      
 - CatalogBatchManager                                                                                                                                         
                                                                                                                                                               
 #### Dialogs and drawers                                                                                                                                      
                                                                                                                                                               
 - ConfirmDialog                                                                                                                                               
 - Calendar detail drawer inside Dashboard                                                                                                                     
 - Personnel drawer inside PersonnelManagementList                                                                                                             
 - Equipment and signature modals inside EquipmentRequestList                                                                                                  
 - Basic Medical confirmation modal inside BasicMedicalRegistrationList                                                                                        
 - Two local staff-shift modal implementations                                                                                                                 
 - Time picker and combobox portaled popovers                                                                                                                  
                                                                                                                                                               
 #### Import                                                                                                                                                   
                                                                                                                                                               
 - ImportWizard                                                                                                                                                
 - EquipmentImportWizard                                                                                                                                       
 - CatalogReconciliationImport                                                                                                                                 
 - CatalogImportActions                                                                                                                                        
 - CatalogImportNew                                                                                                                                            
                                                                                                                                                               
 #### Feedback and status                                                                                                                                      
                                                                                                                                                               
 - Shared CSS classes: action-feedback, form-error, form-success, panel-empty, badge, status-pill.                                                             
 - No shared React feedback, empty-state, error-state, or loading-state primitive.                                                                             
                                                                                                                                                               
 #### Icons                                                                                                                                                    
                                                                                                                                                               
 - One application icon system: Heroicons through components/icons.tsx.                                                                                        
 - Google’s multicolor SVG is the only separate brand icon.                                                                                                    
                                                                                                                                                               
 ### Component classification                                                                                                                                  
                                                                                                                                                               
 Reusable, good foundations                                                                                                                                    
                                                                                                                                                               
 - WorkspaceShell                                                                                                                                              
 - PageHeader                                                                                                                                                  
 - ConfirmDialog                                                                                                                                               
 - SearchableCombobox concept                                                                                                                                  
 - TimePicker concept                                                                                                                                          
 - Pagination components                                                                                                                                       
 - Heroicon wrapper                                                                                                                                            
 - Shared form section classes                                                                                                                                 
 - Shared table CSS contract                                                                                                                                   
                                                                                                                                                               
 Duplicated                                                                                                                                                    
                                                                                                                                                               
 - ImportWizard and EquipmentImportWizard: normalized source similarity approximately 0.66, with 73% class-name overlap.                                       
 - Confirmation/modal mechanics appear in at least five independent implementations.                                                                           
 - Repeated responsive-table + data-table markup appears in 17+ files.                                                                                         
 - Server and client pagination components duplicate presentation.                                                                                             
 - Status/feedback markup is repeated locally.                                                                                                                 
                                                                                                                                                               
 Page-local patterns worth extracting later                                                                                                                    
                                                                                                                                                               
 - Staff-shift segmented controls, repeated registration rows, and modal shells.                                                                               
 - Equipment request expandable summary/detail rows.                                                                                                           
 - Personnel filter toolbar and drawer sections.                                                                                                               
 - Import stepper/preview/footer shell.                                                                                                                        
                                                                                                                                                               
 Over-generalized                                                                                                                                              
                                                                                                                                                               
 - Dashboard: 1,321 lines, 19 top-level props, 11 boolean fields in its source, two domain modes, calendar, drawers and mutations.                             
 - WorkspaceShell: capability-driven navigation with multiple boolean props; acceptable today but high-risk to extend indefinitely.                            
 - EquipmentRequestList: 1,706 lines with list, filters, table, expanded detail, item modal, signature modal, workflow status and deletion.                    
 - StaffShiftRoster: 1,990 lines covering calendar, registration modes, row editor and two dialogs.                                                            
                                                                                                                                                               
 Under-generalized                                                                                                                                             
                                                                                                                                                               
 - Data table shell.                                                                                                                                           
 - Accessible scroll viewport.                                                                                                                                 
 - Form field/error relationship.                                                                                                                              
 - Dialog/drawer focus shell.                                                                                                                                  
 - Button API.                                                                                                                                                 
 - Status badge.                                                                                                                                               
 - Loading/empty/error state.                                                                                                                                  
 - Responsive toolbar.                                                                                                                                         
 - Import wizard shell.                                                                                                                                        
                                                                                                                                                               
 ────────────────────────────────────────────────────────────────────────────────                                                                              
                                                                                                                                                               
 3. CURRENT DESIGN LANGUAGE                                                                                                                                    
                                                                                                                                                               
 ### Colors                                                                                                                                                    
                                                                                                                                                               
 The approved EIU palette is present and recognizable:                                                                                                         
                                                                                                                                                               
 - EIU Blue ■ #144069                                                                                                                                          
 - EIU Gold ■ #A78656                                                                                                                                          
 - EIU Cream ■ #F6F1E8                                                                                                                                         
 - Canvas ■ #F8F6F1                                                                                                                                            
 - Ink ■ #303033                                                                                                                                               
 - Danger ■ #B44425                                                                                                                                            
 - Success ■ #52813B                                                                                                                                           
 - Warning ■ #D88327                                                                                                                                           
                                                                                                                                                               
 There are two overlapping variable layers:                                                                                                                    
                                                                                                                                                               
 - Legacy variables at app/globals.css:3-47.                                                                                                                   
 - Semantic V2 aliases at app/globals.css:10251-10277.                                                                                                         
                                                                                                                                                               
 Static CSS count:                                                                                                                                             
                                                                                                                                                               
 - 313 hexadecimal color occurrences                                                                                                                           
 - 185 unique hexadecimal values                                                                                                                               
                                                                                                                                                               
 Some are legitimate one-off or brand values, but the count demonstrates that semantic tokens are not yet the sole authority.                                  
                                                                                                                                                               
 ### Typography                                                                                                                                                
                                                                                                                                                               
 - Be Vietnam Pro is consistently loaded and should remain.                                                                                                    
 - The V2 roles are well defined.                                                                                                                              
 - Static CSS contains 38 distinct font-size expressions across 289 declarations.                                                                              
 - Tiny sizes remain:                                                                                                                                          
   - 8px: 9 declarations                                                                                                                                       
   - 7px: 5 declarations                                                                                                                                       
   - 6px: 1 declaration                                                                                                                                        
   - Explicit text-[10px] and text-[11px] in StaffShiftRoster.                                                                                                 
 - Page headers and later V2 table/form styles align well with the Master.                                                                                     
 - The highest typography drift is in legacy calendars, metadata, badges, and the staff-shift local Tailwind implementation.                                   
                                                                                                                                                               
 ### Spacing                                                                                                                                                   
                                                                                                                                                               
 - Core intended scale: 4/8/12/16/24/32/48.                                                                                                                    
 - Common usage is centered around 8, 10, 12, 14, 16 and 20.                                                                                                   
 - Static CSS uses 45 distinct pixel spacing values, including repeated 13px and 17px values.                                                                  
 - Dense operational areas generally use space efficiently.                                                                                                    
 - Import and schedule forms have suitable max widths.                                                                                                         
 - The main issue is drift, not uniformly excessive whitespace.                                                                                                
                                                                                                                                                               
 ### Radius                                                                                                                                                    
                                                                                                                                                               
 - Approved semantic policy exists:                                                                                                                            
   - Controls 10px                                                                                                                                             
   - Cards/tables 15px                                                                                                                                         
   - Overlays 16px                                                                                                                                             
   - Pills 999px                                                                                                                                               
 - Static CSS contains 32 distinct radius expressions.                                                                                                         
 - Several 7/8/9/11/12/13/14/18/20px legacy values remain.                                                                                                     
 - The current visual family is still recognizable, but consolidation is warranted.                                                                            
                                                                                                                                                               
 ### Shadows                                                                                                                                                   
                                                                                                                                                               
 - Semantic --shadow-card and legacy --shadow-sm/--shadow-md exist.                                                                                            
 - Static CSS contains 46 distinct shadow expressions.                                                                                                         
 - Most visible surfaces use subtle shadows appropriately.                                                                                                     
 - Staff-shift local Tailwind shadows and older component-specific shadows create avoidable variants.                                                          
                                                                                                                                                               
 ### Icons                                                                                                                                                     
                                                                                                                                                               
 - Strongly consistent Heroicons wrapper.                                                                                                                      
 - Decorative icons are hidden automatically unless an aria-label is passed: components/icons.tsx:58-71.                                                       
 - Preserve this system.                                                                                                                                       
                                                                                                                                                               
 ### Cards                                                                                                                                                     
                                                                                                                                                               
 The app has:                                                                                                                                                  
                                                                                                                                                               
 1. One coherent intended system:                                                                                                                              
   - white surface                                                                                                                                             
   - subtle border                                                                                                                                             
   - 15px radius                                                                                                                                               
   - restrained shadow                                                                                                                                         
 2. Legitimate variants:                                                                                                                                       
   - KPI accent cards                                                                                                                                          
   - calendar/data panels                                                                                                                                      
   - document evidence                                                                                                                                         
   - auth panel                                                                                                                                                
 3. Accidental fragments:                                                                                                                                      
   - staff-shift page-local Tailwind card styling                                                                                                              
   - legacy auth recovery card                                                                                                                                 
   - some nested table/preview shells                                                                                                                          
                                                                                                                                                               
 ### Forms                                                                                                                                                     
                                                                                                                                                               
 Strengths:                                                                                                                                                    
                                                                                                                                                               
 - Numbered form sections are clear.                                                                                                                           
 - Labels usually wrap controls.                                                                                                                               
 - Long forms are grouped.                                                                                                                                     
 - Desktop multi-column to mobile single-column rules exist.                                                                                                   
 - Pending button labels are common.                                                                                                                           
                                                                                                                                                               
 Weaknesses:                                                                                                                                                   
                                                                                                                                                               
 - Error association is usually summary-level rather than field-level.                                                                                         
 - Several filters and repeated row controls have no accessible names.                                                                                         
 - Recovery/reset forms do not use the current auth shell.                                                                                                     
 - Multiple input sizes still exist.                                                                                                                           
                                                                                                                                                               
 ### Tables                                                                                                                                                    
                                                                                                                                                               
 Strengths:                                                                                                                                                    
                                                                                                                                                               
 - Semantic <table> elements.                                                                                                                                  
 - Strong approved shell, header, inset and local scrolling contract.                                                                                          
 - Column intent is documented.                                                                                                                                
 - Pagination exists for large lists.                                                                                                                          
                                                                                                                                                               
 Weaknesses:                                                                                                                                                   
                                                                                                                                                               
 - No shared React table shell.                                                                                                                                
 - Wide-table mobile strategy defaults to horizontal scrolling nearly everywhere.                                                                              
 - Several scroll wrappers omit role="region", accessible label and tabIndex={0}.                                                                              
 - Repeated local markup invites visual and accessibility drift.                                                                                               
                                                                                                                                                               
 ### Status system                                                                                                                                             
                                                                                                                                                               
 - Text labels accompany status colors.                                                                                                                        
 - Semantic success/warning/danger colors exist.                                                                                                               
 - Badge and pill geometry is mostly consistent.                                                                                                               
 - Local Tailwind colors in staff shifts bypass the semantic status system.                                                                                    
                                                                                                                                                               
 ### Token/pattern audit                                                                                                                                       
                                                                                                                                                               
 ┌─────────────────┬───────────────────────────────┬────────────────────────────┬───────────────┬──────────────────────────┬─────────────────────────────────┐ 
 │ Token / pattern │ Current implementation        │ Usage                      │ Consistency   │ Issue                    │ Recommendation                  │ 
 ├─────────────────┼───────────────────────────────┼────────────────────────────┼───────────────┼──────────────────────────┼─────────────────────────────────┤ 
 │ Primary         │ --eiu-blue, --primary,        │ Navigation, buttons,       │ Medium        │ Multiple aliases for one │ EXISTING — consolidate aliases  │ 
 │                 │ teal/indigo/blue aliases      │ headings                   │               │ color                    │ gradually                       │ 
 ├─────────────────┼───────────────────────────────┼────────────────────────────┼───────────────┼──────────────────────────┼─────────────────────────────────┤ 
 │ Secondary       │ --eiu-gold, --secondary       │ Accent, active nav,        │ Good          │ Some direct hex use      │ EXISTING — formalize            │ 
 │                 │                               │ borders                    │               │                          │                                 │ 
 ├─────────────────┼───────────────────────────────┼────────────────────────────┼───────────────┼──────────────────────────┼─────────────────────────────────┤ 
 │ Canvas/surface  │ --canvas, --surface,          │ Pages/cards                │ Good          │ Two naming generations   │ Consolidate naming              │ 
 │                 │ --surface-soft/subtle         │                            │               │                          │                                 │ 
 ├─────────────────┼───────────────────────────────┼────────────────────────────┼───────────────┼──────────────────────────┼─────────────────────────────────┤ 
 │ Foreground      │ --ink-*, --foreground*        │ Text hierarchy             │ Medium        │ Muted ■ #7A7A7D is       │ Reserve for nonessential        │ 
 │                 │                               │                            │               │ 4.28:1 on white          │ large/decorative copy or darken │ 
 ├─────────────────┼───────────────────────────────┼────────────────────────────┼───────────────┼──────────────────────────┼─────────────────────────────────┤ 
 │ Status          │ semantic and legacy aliases   │ Badges, alerts, buttons    │ Medium        │ Staff-shift hard-coded   │ Route local styles through      │ 
 │                 │                               │                            │               │ Tailwind variants        │ existing semantic statuses      │ 
 ├─────────────────┼───────────────────────────────┼────────────────────────────┼───────────────┼──────────────────────────┼─────────────────────────────────┤ 
 │ Radius          │ old sm/md/lg plus             │ All components             │ Medium        │ 32 expressions           │ Remove obsolete variants after  │ 
 │                 │ control/card/overlay          │                            │               │                          │ visual comparison               │ 
 ├─────────────────┼───────────────────────────────┼────────────────────────────┼───────────────┼──────────────────────────┼─────────────────────────────────┤ 
 │ Shadows         │ legacy and V2 variables plus  │ Cards/overlays             │ Weak–medium   │ 46 expressions           │ Keep approved card, overlay and │ 
 │                 │ hardcodes                     │                            │               │                          │ logo shadows only               │ 
 ├─────────────────┼───────────────────────────────┼────────────────────────────┼───────────────┼──────────────────────────┼─────────────────────────────────┤ 
 │ Spacing         │ mostly 4–32px                 │ Layout/forms/tables        │ Medium        │ 45 values                │ Formalize existing scale; keep  │ 
 │                 │                               │                            │               │                          │ exceptions only where measured  │ 
 ├─────────────────┼───────────────────────────────┼────────────────────────────┼───────────────┼──────────────────────────┼─────────────────────────────────┤ 
 │ Page title      │ shared PageHeader             │ Authenticated routes       │ Strong        │ Login/recovery outside   │ Preserve and extend             │ 
 │                 │                               │                            │               │ shared hierarchy         │ auth-specific hierarchy         │ 
 ├─────────────────┼───────────────────────────────┼────────────────────────────┼───────────────┼──────────────────────────┼─────────────────────────────────┤ 
 │ Buttons         │ CSS class variants            │ 42 UI files                │ Medium–strong │ No shared component/API; │ Formalize existing classes      │ 
 │                 │                               │                            │               │ no pressed state         │ first                           │ 
 ├─────────────────┼───────────────────────────────┼────────────────────────────┼───────────────┼──────────────────────────┼─────────────────────────────────┤ 
 │ Data table      │ CSS shell contract            │ 25 table                   │ Medium        │ Repeated markup and      │ Consolidate a structural        │ 
 │                 │                               │ implementations/families   │               │ inconsistent focusable   │ primitive                       │ 
 │                 │                               │                            │               │ scroll                   │                                 │ 
 ├─────────────────┼───────────────────────────────┼────────────────────────────┼───────────────┼──────────────────────────┼─────────────────────────────────┤ 
 │ Z-index         │ 39 declarations, 23 values    │ Sticky                     │ Weak          │ No declared layering     │ Formalize current actual        │ 
 │                 │                               │ UI/popovers/overlays       │               │ policy                   │ layers; do not introduce new    │ 
 │                 │                               │                            │               │                          │ values casually                 │ 
 └─────────────────┴───────────────────────────────┴────────────────────────────┴───────────────┴──────────────────────────┴─────────────────────────────────┘ 
                                                                                                                                                               
 ### KEEP                                                                                                                                                      
                                                                                                                                                               
 - EIU blue/gold/cream.                                                                                                                                        
 - Be Vietnam Pro.                                                                                                                                             
 - Sidebar gradient, logo block and gold active accent.                                                                                                        
 - White sticky topbar and blue page titles.                                                                                                                   
 - Dense operational layout.                                                                                                                                   
 - KPI cards.                                                                                                                                                  
 - Existing card/table visual direction.                                                                                                                       
 - Heroicons.                                                                                                                                                  
 - Numbered form sections.                                                                                                                                     
 - Current login visual.                                                                                                                                       
 - Confirmation dialog tone.                                                                                                                                   
                                                                                                                                                               
 ### INCONSISTENCIES                                                                                                                                           
                                                                                                                                                               
 - Two generations of tokens.                                                                                                                                  
 - Legacy styles followed by high-specificity V2 corrections.                                                                                                  
 - 248 repeated exact CSS selectors in static analysis.                                                                                                        
 - Staff shifts introduce a local neutral/emerald/rose Tailwind language.                                                                                      
 - Recovery/reset pages use obsolete auth composition.                                                                                                         
 - Multiple overlay implementations.                                                                                                                           
 - Typography below the approved content floor.                                                                                                                
 - Wide-table behavior lacks per-table information-priority decisions.                                                                                         
                                                                                                                                                               
 ────────────────────────────────────────────────────────────────────────────────                                                                              
                                                                                                                                                               
 4. RESPONSIVE AUDIT                                                                                                                                           
                                                                                                                                                               
 ### 375px                                                                                                                                                     
                                                                                                                                                               
 - Rating: WEAK                                                                                                                                                
 - Rendered /login:                                                                                                                                            
   - No horizontal overflow.                                                                                                                                   
   - Main actions are 50px high.                                                                                                                               
   - Card fits the viewport.                                                                                                                                   
   - Vertical page scrolling is required but usable.                                                                                                           
 - Rendered /forgot-password and /reset-password:                                                                                                              
   - Visibly broken composition.                                                                                                                               
   - Heading and back link sit against the viewport edge.                                                                                                      
   - Form label/control alignment is cramped.                                                                                                                  
   - Card does not resemble the approved login family.                                                                                                         
 - Static protected-shell strengths:                                                                                                                           
   - 12px mobile gutters.                                                                                                                                      
   - Mobile sidebar uses 86vw, max 320px.                                                                                                                      
   - Filters stack.                                                                                                                                            
   - Drawers use viewport dimensions.                                                                                                                          
   - Tables scroll locally.                                                                                                                                    
 - Problems:                                                                                                                                                   
   - Staff-shift event actions are only 24×28px: app/globals.css:9155-9170.                                                                                    
   - Several repeated-row controls lack labels.                                                                                                                
   - Editable row tables are poor candidates for horizontal scrolling alone.                                                                                   
   - Mobile sidebar and custom dialogs lack complete focus containment.                                                                                        
                                                                                                                                                               
 ### 768px                                                                                                                                                     
                                                                                                                                                               
 - Rating: ACCEPTABLE                                                                                                                                          
 - Rendered login uses a centered branded overlay over the campus image with no horizontal overflow.                                                           
 - Static CSS:                                                                                                                                                 
   - Intentional single-column forms.                                                                                                                          
   - Two-column KPI grid.                                                                                                                                      
   - Local calendar/table scroll.                                                                                                                              
   - Off-canvas navigation at widths below 920px.                                                                                                              
 - Problems:                                                                                                                                                   
   - Password recovery/reset shell remains visually broken.                                                                                                    
   - Tablet often receives stacked mobile layouts rather than a deliberate intermediate form layout.                                                           
   - Wide operational tables still require extensive lateral movement.                                                                                         
                                                                                                                                                               
 ### 1024px                                                                                                                                                    
                                                                                                                                                               
 - Rating: ACCEPTABLE                                                                                                                                          
 - Rendered login switches cleanly to split-image/panel layout.                                                                                                
 - Desktop sidebar remains visible at this width, leaving approximately 780px before page gutters.                                                             
 - Forms use bounded widths; dense tables scroll locally.                                                                                                      
 - Risks:                                                                                                                                                      
   - Sidebar + table width makes 1024px effectively a compressed desktop.                                                                                      
   - Several 980–1420px table minima force scrolling.                                                                                                          
   - Toolbar wrap behavior depends on extensive late CSS overrides.                                                                                            
                                                                                                                                                               
 ### 1440px                                                                                                                                                    
                                                                                                                                                               
 - Rating: ACCEPTABLE                                                                                                                                          
 - Rendered login is balanced and visually mature.                                                                                                             
 - Authenticated design is explicitly desktop-productivity-first.                                                                                              
 - Schedule forms remain bounded around 980px.                                                                                                                 
 - Import/admin content has 1180px conventions.                                                                                                                
 - Broad data tables appropriately receive more width.                                                                                                         
 - Remaining weaknesses are consistency and architecture rather than basic layout.                                                                             
 - Protected authenticated screens could not be visually verified, so a GOOD rating is not yet justified.                                                      
                                                                                                                                                               
 ────────────────────────────────────────────────────────────────────────────────                                                                              
                                                                                                                                                               
 5. NAVIGATION                                                                                                                                                 
                                                                                                                                                               
 ### Strengths                                                                                                                                                 
                                                                                                                                                               
 - One central role-aware navigation builder.                                                                                                                  
 - Semantic <aside> and <nav>.                                                                                                                                 
 - Active states are clear and retain the approved gold accent.                                                                                                
 - Mobile menu open/close buttons have accessible names.                                                                                                       
 - Sidebar scroll position is retained between routes.                                                                                                         
 - Account trigger exposes aria-controls and aria-expanded.                                                                                                    
 - Navigation hierarchy reflects the product domains:                                                                                                          
   - Skills                                                                                                                                                    
   - Schedule creation                                                                                                                                         
   - Class management                                                                                                                                          
   - Room operations                                                                                                                                           
   - Basic Medical                                                                                                                                             
   - Administration                                                                                                                                            
                                                                                                                                                               
 ### Issues                                                                                                                                                    
                                                                                                                                                               
 - WorkspaceShell is a high-blast-radius client component with multiple capability flags.                                                                      
 - Mobile sidebar sets role="dialog" and aria-modal, but traps neither focus nor background interaction: components/workspace-shell.tsx:451-469.               
 - Scrim-click close does not explicitly restore focus to the menu trigger.                                                                                    
 - The account popover moves focus to logout but does not implement menu semantics; acceptable for one action but not scalable.                                
 - Mobile users must scroll a long navigation list; current grouping is necessary and should remain.                                                           
                                                                                                                                                               
 ### Mobile                                                                                                                                                    
                                                                                                                                                               
 - Width and safe-area handling are good.                                                                                                                      
 - Navigation is scrollable and overscroll-contained.                                                                                                          
 - Close affordance is 42px, slightly below the 44px mobile control convention.                                                                                
 - Focus containment is the main failure, not layout.                                                                                                          
                                                                                                                                                               
 ### Recommendations                                                                                                                                           
                                                                                                                                                               
 - Keep navigation information architecture and visual treatment.                                                                                              
 - Add shared overlay focus/inert behavior to the mobile sidebar.                                                                                              
 - Keep role/capability logic centralized.                                                                                                                     
 - Avoid turning every capability into another WorkspaceShell boolean; prefer a prepared navigation model if the API grows further.                            
 - Do not replace the sidebar with a fashionable alternative.                                                                                                  
                                                                                                                                                               
 ────────────────────────────────────────────────────────────────────────────────                                                                              
                                                                                                                                                               
 6. TABLES                                                                                                                                                     
                                                                                                                                                               
 ### Strategy definitions                                                                                                                                      
                                                                                                                                                               
 - A: Horizontal scrolling acceptable                                                                                                                          
 - B: Hide lower-priority columns                                                                                                                              
 - C: Transform rows into cards                                                                                                                                
 - D: Expandable/detail row                                                                                                                                    
 - E: Split summary/detail                                                                                                                                     
 - F: Mobile-specific condensed table                                                                                                                          
                                                                                                                                                               
 ### Table inventory                                                                                                                                           
                                                                                                                                                               
 ┌─────────────────────┬─────────────────────────────────────┬─────────────────────────────────┬────────────────────────┬────────────────────────────────────┐ 
 │ Route / component   │ Purpose and columns                 │ Actions / controls              │ Current mobile         │ Recommended strategy               │ 
 │                     │                                     │                                 │ behavior               │                                    │ 
 ├─────────────────────┼─────────────────────────────────────┼─────────────────────────────────┼────────────────────────┼────────────────────────────────────┤ 
 │ /dashboard          │ Upcoming schedule: date, time,      │ Row information                 │ Local horizontal       │ B — retain date/time/course/room;  │ 
 │                     │ code, course, room, lecturer        │                                 │ scroll                 │ collapse code and lecturer         │ 
 │                     │                                     │                                 │                        │ metadata where needed              │ 
 ├─────────────────────┼─────────────────────────────────────┼─────────────────────────────────┼────────────────────────┼────────────────────────────────────┤ 
 │ /imports            │ Import batch history: 10 columns    │ Pagination, error export/link   │ Local horizontal       │ D — compact batch summary with     │ 
 │                     │                                     │                                 │ scroll                 │ expandable counts/errors           │ 
 ├─────────────────────┼─────────────────────────────────────┼─────────────────────────────────┼────────────────────────┼────────────────────────────────────┤ 
 │ Evidence route      │ Equipment condition evidence: 5     │ None                            │ Local scroll source,   │ A — preserve document table        │ 
 │                     │ columns                             │                                 │ wrapper not            │                                    │ 
 │                     │                                     │                                 │ keyboard-labelled      │                                    │ 
 ├─────────────────────┼─────────────────────────────────────┼─────────────────────────────────┼────────────────────────┼────────────────────────────────────┤ 
 │ /admin/rooms room   │ Name, code, status                  │ Toggle action                   │ Local scroll           │ F — 3-column condensed table can   │ 
 │ types               │                                     │                                 │                        │ fit mobile                         │ 
 ├─────────────────────┼─────────────────────────────────────┼─────────────────────────────────┼────────────────────────┼────────────────────────────────────┤ 
 │ /admin/audit        │ Time, actor, action, target, record │ URL pagination                  │ Focusable local scroll │ A — audit comparison benefits from │ 
 │                     │ ID                                  │                                 │                        │ columns                            │ 
 ├─────────────────────┼─────────────────────────────────────┼─────────────────────────────────┼────────────────────────┼────────────────────────────────────┤ 
 │ Basic Medical       │ 9 catalog columns                   │ Select/edit/activate/deactivate │ 1420px-style wide      │ A — approved equipment table       │ 
 │ catalog             │                                     │ /delete                         │ table                  │ contract                           │ 
 ├─────────────────────┼─────────────────────────────────────┼─────────────────────────────────┼────────────────────────┼────────────────────────────────────┤ 
 │ Basic Medical room  │ Room, device, trade name, unit,     │ Edit allocation                 │ Local scroll; wrapper  │ E — room/device summary plus       │ 
 │ inventory           │ total/good/damaged/action           │                                 │ not focusable          │ detail/action                      │ 
 ├─────────────────────┼─────────────────────────────────────┼─────────────────────────────────┼────────────────────────┼────────────────────────────────────┤ 
 │ Basic Medical       │ Device, room, unit, counts,         │ Condition edit                  │ Local scroll; wrapper  │ B — prioritize                     │ 
 │ damaged inventory   │ actor/date/action                   │                                 │ not focusable          │ device/room/damaged/action         │ 
 ├─────────────────────┼─────────────────────────────────────┼─────────────────────────────────┼────────────────────────┼────────────────────────────────────┤ 
 │ Basic Medical       │ 8 audit columns                     │ Filters                         │ Local scroll; wrapper  │ A                                  │ 
 │ condition logs      │                                     │                                 │ not focusable          │                                    │ 
 ├─────────────────────┼─────────────────────────────────────┼─────────────────────────────────┼────────────────────────┼────────────────────────────────────┤ 
 │ Basic Medical       │ 10 item columns                     │ Read-only                       │ Local scroll; wrapper  │ A                                  │ 
 │ equipment detail    │                                     │                                 │ not focusable          │                                    │ 
 ├─────────────────────┼─────────────────────────────────────┼─────────────────────────────────┼────────────────────────┼────────────────────────────────────┤ 
 │ Basic Medical       │ 7 editable columns                  │ Add/delete/edit quantities      │ Local scroll           │ C — editable mobile rows are       │ 
 │ request item editor │                                     │                                 │                        │ better as repeated item cards      │ 
 ├─────────────────────┼─────────────────────────────────────┼─────────────────────────────────┼────────────────────────┼────────────────────────────────────┤ 
 │ Basic Medical       │ Date/time/topic/lecturer fields     │ Add/edit session rows           │ Local scroll           │ F — compact stacked mobile row,    │ 
 │ registration        │                                     │                                 │                        │ desktop remains table              │ 
 │ session editor      │                                     │                                 │                        │                                    │ 
 ├─────────────────────┼─────────────────────────────────────┼─────────────────────────────────┼────────────────────────┼────────────────────────────────────┤ 
 │ Basic Medical       │ Device/state/counts                 │ Damage inputs                   │ Local scroll           │ F — retain table semantics with    │ 
 │ confirmation        │                                     │                                 │                        │ condensed columns                  │ 
 │ condition table     │                                     │                                 │                        │                                    │ 
 ├─────────────────────┼─────────────────────────────────────┼─────────────────────────────────┼────────────────────────┼────────────────────────────────────┤ 
 │ Basic Medical       │ Collapsed registration summary +    │ Expand, edit, cancel, confirm   │ Existing expandable    │ D — current approved direction     │ 
 │ registrations       │ nested sessions                     │                                 │ concept                │                                    │ 
 ├─────────────────────┼─────────────────────────────────────┼─────────────────────────────────┼────────────────────────┼────────────────────────────────────┤ 
 │ Course/room catalog │ Selection,                          │ Bulk actions and row edits      │ Local scroll           │ B — hide nonapplicable             │ 
 │ manager             │ code/name/type/capacity/status      │                                 │                        │ type/capacity columns per catalog  │ 
 ├─────────────────────┼─────────────────────────────────────┼─────────────────────────────────┼────────────────────────┼────────────────────────────────────┤ 
 │ Catalog import      │ 7 equipment columns                 │ Confirm/cancel, pagination      │ Focusable local scroll │ A                                  │ 
 │ preview             │                                     │                                 │                        │                                    │ 
 ├─────────────────────┼─────────────────────────────────────┼─────────────────────────────────┼────────────────────────┼────────────────────────────────────┤ 
 │ /classes/open,      │ 8 columns:                          │ Filters, claim/edit/export      │ 1040px table in local  │ B — hide code/student count first; │ 
 │ /classes/mine       │ date/time/code/name/room/students/l │                                 │ scroll                 │ keep actions visible               │ 
 │                     │ ecturer/action                      │                                 │                        │                                    │ 
 ├─────────────────────┼─────────────────────────────────────┼─────────────────────────────────┼────────────────────────┼────────────────────────────────────┤ 
 │ Email notifications │ 8 columns                           │ Selection/retry                 │ Focusable local scroll │ E — recipient/status/time summary  │ 
 │                     │                                     │                                 │                        │ plus message/error detail          │ 
 ├─────────────────────┼─────────────────────────────────────┼─────────────────────────────────┼────────────────────────┼────────────────────────────────────┤ 
 │ Skills equipment    │ 9 equipment columns                 │ Bulk stable action group        │ Wide local scroll      │ A — Master explicitly supports     │ 
 │ catalog             │                                     │                                 │                        │ this                               │ 
 ├─────────────────────┼─────────────────────────────────────┼─────────────────────────────────┼────────────────────────┼────────────────────────────────────┤ 
 │ Schedule import     │ Dynamic source fields + validation  │ Pagination/wizard controls      │ Focusable local scroll │ A                                  │ 
 │ preview             │                                     │                                 │                        │                                    │ 
 ├─────────────────────┼─────────────────────────────────────┼─────────────────────────────────┼────────────────────────┼────────────────────────────────────┤ 
 │ Equipment import    │ Dynamic source fields + validation  │ Pagination/wizard controls      │ Focusable local scroll │ A                                  │ 
 │ preview             │                                     │                                 │                        │                                    │ 
 ├─────────────────────┼─────────────────────────────────────┼─────────────────────────────────┼────────────────────────┼────────────────────────────────────┤ 
 │ Skills equipment    │ 6 editable columns                  │ Add/delete                      │ Local scroll; wrapper  │ C                                  │ 
 │ request item editor │                                     │                                 │ not focusable          │                                    │ 
 ├─────────────────────┼─────────────────────────────────────┼─────────────────────────────────┼────────────────────────┼────────────────────────────────────┤ 
 │ Equipment detail    │ 10 columns                          │ Add item where allowed          │ Local scroll; wrapper  │ A desktop; C only for mobile       │ 
 │ modal               │                                     │                                 │ not focusable          │ editing                            │ 
 ├─────────────────────┼─────────────────────────────────────┼─────────────────────────────────┼────────────────────────┼────────────────────────────────────┤ 
 │ Equipment request   │ 8 summary columns + expanded detail │ Status/sign/delete/expand       │ Wide table, existing   │ D — preserve current concept,      │ 
 │ list                │                                     │                                 │ expanded detail        │ condense collapsed row             │ 
 ├─────────────────────┼─────────────────────────────────────┼─────────────────────────────────┼────────────────────────┼────────────────────────────────────┤ 
 │ Personnel           │ Operation/person/type/status/time   │ Reconcile                       │ Local scroll; wrapper  │ A                                  │ 
 │ reconciliation      │                                     │                                 │ not focusable          │                                    │ 
 ├─────────────────────┼─────────────────────────────────────┼─────────────────────────────────┼────────────────────────┼────────────────────────────────────┤ 
 │ Personnel list      │ 8 columns                           │ Filter, edit drawer             │ 1180px minimum         │ E — compact identity/status        │ 
 │                     │                                     │                                 │                        │ summary leading to drawer          │ 
 └─────────────────────┴─────────────────────────────────────┴─────────────────────────────────┴────────────────────────┴────────────────────────────────────┘ 
                                                                                                                                                               
 ### Cross-table findings                                                                                                                                      
                                                                                                                                                               
 - The visual shell contract is strong.                                                                                                                        
 - responsive-table appears 23 times across 17 files.                                                                                                          
 - Several wrappers correctly implement role="region", a descriptive label and tabIndex={0}.                                                                   
 - Several do not, including equipment item editors, Basic Medical inventory tables and personnel reconciliation.                                              
 - A reusable TableScrollViewport should formalize keyboard access without changing visual design.                                                             
 - Do not convert all tables into cards. Catalog, audit, evidence and import previews benefit from horizontal comparison.                                      
 - Editable rows and personnel/equipment summary workflows need a more intentional mobile strategy than scrolling alone.                                       
                                                                                                                                                               
 ────────────────────────────────────────────────────────────────────────────────                                                                              
                                                                                                                                                               
 7. FORMS                                                                                                                                                      
                                                                                                                                                               
 ┌───────────────────────────┬─────────────────────────────────┬───────────────────────────────────────────────────────┬─────────────────────────────────────┐ 
 │ Form family               │ Strengths                       │ Issues                                                │ Mobile direction                    │ 
 ├───────────────────────────┼─────────────────────────────────┼───────────────────────────────────────────────────────┼─────────────────────────────────────┤ 
 │ Login                     │ Clear labels, autocomplete,     │ No <h1>; “remember login” checkbox has no state/name  │ Keep rendered layout                │ 
 │                           │ 50px actions, pending labels    │ and therefore no observable behavior                  │                                     │ 
 ├───────────────────────────┼─────────────────────────────────┼───────────────────────────────────────────────────────┼─────────────────────────────────────┤ 
 │ Recovery/reset/change     │ Simple fields and labels        │ Uses obsolete shell; missing new-password             │ Reuse current auth composition,     │ 
 │                           │                                 │ autocomplete; feedback lacks live semantics; no       │ single column                       │ 
 │                           │                                 │ pending text                                          │                                     │ 
 ├───────────────────────────┼─────────────────────────────────┼───────────────────────────────────────────────────────┼─────────────────────────────────────┤ 
 │ Create Skills schedule    │ Numbered sections, bounded      │ Error summary not tied to fields                      │ Preserve; single-column mobile      │ 
 │                           │ width, coherent footer          │                                                       │                                     │ 
 ├───────────────────────────┼─────────────────────────────────┼───────────────────────────────────────────────────────┼─────────────────────────────────────┤ 
 │ Create Basic Medical      │ Good business grouping, session │ Long workflow; table-based row editing on phone       │ Preserve sections; condensed mobile │ 
 │ registration              │ table                           │                                                       │ session editor; consider sticky     │ 
 │                           │                                 │                                                       │ action footer                       │ 
 ├───────────────────────────┼─────────────────────────────────┼───────────────────────────────────────────────────────┼─────────────────────────────────────┤ 
 │ Skills equipment request  │ Strong domain grouping and      │ Editable table is difficult on phone; field errors    │ Item-card editor on mobile only     │ 
 │                           │ pending state                   │ weakly associated                                     │                                     │ 
 ├───────────────────────────┼─────────────────────────────────┼───────────────────────────────────────────────────────┼─────────────────────────────────────┤ 
 │ Basic Medical equipment   │ Similar strengths               │ Same editable-row issue; long form                    │ Same mobile item pattern            │ 
 │ request                   │                                 │                                                       │                                     │ 
 ├───────────────────────────┼─────────────────────────────────┼───────────────────────────────────────────────────────┼─────────────────────────────────────┤ 
 │ Staff-shift registration  │ Flexible week/freeform modes    │ Page-local visual language; repeated date/select/time │ Add explicit row labels; preserve   │ 
 │                           │                                 │ controls lack names; 10–11px metadata                 │ single-column rules                 │ 
 ├───────────────────────────┼─────────────────────────────────┼───────────────────────────────────────────────────────┼─────────────────────────────────────┤ 
 │ Staff-shift quick/edit    │ Clear content grouping          │ Labels are visually adjacent but not associated;      │ Shared dialog shell and field       │ 
 │ dialogs                   │                                 │ TimePicker receives no ariaLabel; no focus trap       │ contract                            │ 
 ├───────────────────────────┼─────────────────────────────────┼───────────────────────────────────────────────────────┼─────────────────────────────────────┤ 
 │ Personnel create/edit     │ Fieldsets and semantic          │ Very long drawer; error association is summary-level  │ Existing full-width mobile drawer   │ 
 │                           │ grouping; sticky drawer footer  │                                                       │ is appropriate                      │ 
 ├───────────────────────────┼─────────────────────────────────┼───────────────────────────────────────────────────────┼─────────────────────────────────────┤ 
 │ Catalog add/edit          │ Compact operational layout;     │ Form patterns are split between server forms and      │ Keep dense desktop; deliberate      │ 
 │                           │ manual add defaults collapsed   │ client batch editors                                  │ one-column mobile                   │ 
 ├───────────────────────────┼─────────────────────────────────┼───────────────────────────────────────────────────────┼─────────────────────────────────────┤ 
 │ Import wizards            │ Excellent five-step structure,  │ Two near-duplicate implementations                    │ Consolidate shell only; retain      │ 
 │                           │ preview, validation, pending    │                                                       │ domain validation                   │ 
 │                           │ states                          │                                                       │                                     │ 
 ├───────────────────────────┼─────────────────────────────────┼───────────────────────────────────────────────────────┼─────────────────────────────────────┤ 
 │ Filter toolbars           │ Strong 44px V2 contract         │ Some unlabelled selects/inputs, notably               │ Stack; preserve labels through      │ 
 │                           │                                 │ app/basic-medical/equipment/page.tsx:167-195          │ visually hidden text                │ 
 └───────────────────────────┴─────────────────────────────────┴───────────────────────────────────────────────────────┴─────────────────────────────────────┘ 
                                                                                                                                                               
 ### Form recommendations                                                                                                                                      
                                                                                                                                                               
 - Formalize:                                                                                                                                                  
   - FormField                                                                                                                                                 
   - FieldLabel                                                                                                                                                
   - FieldDescription                                                                                                                                          
   - FieldError                                                                                                                                                
   - aria-invalid                                                                                                                                              
   - aria-describedby                                                                                                                                          
 - Focus the first invalid field after submit where practical.                                                                                                 
 - Keep submit enabled until submission starts; current pending handling generally follows this.                                                               
 - Do not turn every long form into a wizard. Existing sectioned forms are appropriate.                                                                        
 - Use sticky action areas only for the longest mobile forms and drawers.                                                                                      
                                                                                                                                                               
 ────────────────────────────────────────────────────────────────────────────────                                                                              
                                                                                                                                                               
 8. SCREEN-BY-SCREEN FINDINGS                                                                                                                                  
                                                                                                                                                               
 ### SCREEN: Login                                                                                                                                             
                                                                                                                                                               
 ROUTE: /login                                                                                                                                                 
                                                                                                                                                               
 PURPOSE: Authenticate staff through password or Google.                                                                                                       
                                                                                                                                                               
 CURRENT STRENGTHS:                                                                                                                                            
 - Strong EIU visual identity.                                                                                                                                 
 - Good desktop split layout and mobile branded overlay.                                                                                                       
 - No horizontal overflow at 375, 768, 1024 or 1440.                                                                                                           
 - Correct input autocomplete.                                                                                                                                 
 - Clear pending labels.                                                                                                                                       
 - Rendered axe scan: 24 rules passed, no definite WCAG A/AA violation.                                                                                        
                                                                                                                                                               
 ISSUES:                                                                                                                                                       
 - No <h1>; the product title is <h2>: app/login/login-form.tsx:42-48.                                                                                         
 - “Ghi nhớ đăng nhập” is not connected to state or submission: app/login/login-form.tsx:69-72.                                                                
 - Two rendered text nodes use ■ #7A7A7D on white at 4.28:1.                                                                                                   
                                                                                                                                                               
 MOBILE:                                                                                                                                                       
 - Usable at 375.                                                                                                                                              
 - Main actions are 50px.                                                                                                                                      
 - Vertical scrolling is acceptable.                                                                                                                           
                                                                                                                                                               
 ACCESSIBILITY:                                                                                                                                                
 - Strong labels and names.                                                                                                                                    
 - Minor heading and contrast issues.                                                                                                                          
                                                                                                                                                               
 DESIGN SYSTEM:                                                                                                                                                
 - This is the approved auth visual reference.                                                                                                                 
                                                                                                                                                               
 RECOMMENDED DIRECTION:                                                                                                                                        
 - Preserve layout and brand.                                                                                                                                  
 - Correct semantics and low-contrast secondary copy only.                                                                                                     
                                                                                                                                                               
 PRIORITY: P2                                                                                                                                                  
                                                                                                                                                               
 ────────────────────────────────────────────────────────────────────────────────                                                                              
                                                                                                                                                               
 ### SCREEN: Password recovery and password change                                                                                                             
                                                                                                                                                               
 ROUTES: /forgot-password, /reset-password, /change-password                                                                                                   
                                                                                                                                                               
 PURPOSE: Recover or change credentials.                                                                                                                       
                                                                                                                                                               
 CURRENT STRENGTHS:                                                                                                                                            
 - Simple, understandable field order.                                                                                                                         
 - Native labels.                                                                                                                                              
 - Core controls remain technically operable.                                                                                                                  
                                                                                                                                                               
 ISSUES:                                                                                                                                                       
 - Rendered layout is visibly broken at 375 and 1440.                                                                                                          
 - Root cause: pages render login-page > login-card, while current login CSS expects login-brand + login-form-wrap > login-form.                               
 - login-card receives only generic radius/shadow styling: app/globals.css:11511-11517.                                                                        
 - Password fields lack autoComplete="new-password": components/password-change-form.tsx:13-20.                                                                
 - Feedback is not announced with role="status"/alert: components/password-change-form.tsx:21-28.                                                              
                                                                                                                                                               
 MOBILE:                                                                                                                                                       
 - Label/control arrangement is cramped and visually detached from the approved login.                                                                         
                                                                                                                                                               
 ACCESSIBILITY:                                                                                                                                                
 - Labels exist.                                                                                                                                               
 - Status and autocomplete behavior need improvement.                                                                                                          
                                                                                                                                                               
 DESIGN SYSTEM:                                                                                                                                                
 - Accidental legacy fragment.                                                                                                                                 
                                                                                                                                                               
 RECOMMENDED DIRECTION:                                                                                                                                        
 - Recompose these screens using the existing login family. Do not invent another auth design.                                                                 
                                                                                                                                                               
 PRIORITY: P1                                                                                                                                                  
                                                                                                                                                               
 ────────────────────────────────────────────────────────────────────────────────                                                                              
                                                                                                                                                               
 ### SCREEN: Dashboard                                                                                                                                         
                                                                                                                                                               
 ROUTE: /dashboard                                                                                                                                             
                                                                                                                                                               
 PURPOSE: Present operational KPIs and upcoming schedules.                                                                                                     
                                                                                                                                                               
 CURRENT STRENGTHS:                                                                                                                                            
 - Approved KPI cards.                                                                                                                                         
 - Clear page hierarchy.                                                                                                                                       
 - Upcoming schedule uses semantic table structure.                                                                                                            
 - Quick access to relevant operations.                                                                                                                        
                                                                                                                                                               
 ISSUES:                                                                                                                                                       
 - Xem tất cả is rendered as a button without an action: components/dashboard.tsx:791-793.                                                                     
 - Upcoming table relies on scrolling for all six columns.                                                                                                     
 - No route-level loading or error boundary.                                                                                                                   
                                                                                                                                                               
 MOBILE:                                                                                                                                                       
 - KPI two-column strategy is sensible.                                                                                                                        
 - Upcoming table should prioritize date/time/course/room.                                                                                                     
                                                                                                                                                               
 ACCESSIBILITY:                                                                                                                                                
 - Shared shell and page heading are strong.                                                                                                                   
 - Dead affordance is confusing.                                                                                                                               
                                                                                                                                                               
 DESIGN SYSTEM:                                                                                                                                                
 - Strong reference screen.                                                                                                                                    
                                                                                                                                                               
 RECOMMENDED DIRECTION:                                                                                                                                        
 - Keep structure; fix action semantics and table priorities.                                                                                                  
                                                                                                                                                               
 PRIORITY: P2                                                                                                                                                  
                                                                                                                                                               
 ────────────────────────────────────────────────────────────────────────────────                                                                              
                                                                                                                                                               
 ### SCREEN: Skills and Basic Medical calendars                                                                                                                
                                                                                                                                                               
 ROUTES: /class-schedules, /basic-medical/schedules                                                                                                            
                                                                                                                                                               
 PURPOSE: Display month/week/list schedules and editable details.                                                                                              
                                                                                                                                                               
 CURRENT STRENGTHS:                                                                                                                                            
 - Shared visual calendar master.                                                                                                                              
 - URL-driven view state.                                                                                                                                      
 - Explicit responsive list default when no view is supplied.                                                                                                  
 - Current-day and event hierarchy are clear.                                                                                                                  
 - Detail drawer fits the viewport.                                                                                                                            
                                                                                                                                                               
 ISSUES:                                                                                                                                                       
 - One 1,321-line component serves both domains through many conditional props.                                                                                
 - Detail drawer uses custom focus logic rather than the shared dialog primitive.                                                                              
 - Dense calendar still uses large local horizontal grids for explicit week/month views.                                                                       
                                                                                                                                                               
 MOBILE:                                                                                                                                                       
 - Default list behavior is a strong decision.                                                                                                                 
 - User-selected week/month appropriately remains respected.                                                                                                   
 - Explicit wide views require scrolling, which is acceptable.                                                                                                 
                                                                                                                                                               
 ACCESSIBILITY:                                                                                                                                                
 - Drawer is labelled, but complete focus trap and return behavior should be standardized.                                                                     
                                                                                                                                                               
 DESIGN SYSTEM:                                                                                                                                                
 - Preserve as Calendar Master.                                                                                                                                
                                                                                                                                                               
 RECOMMENDED DIRECTION:                                                                                                                                        
 - Split explicit domain adapters from shared calendar presentation only when implementing; do not duplicate visuals.                                          
                                                                                                                                                               
 PRIORITY: P2                                                                                                                                                  
                                                                                                                                                               
 ────────────────────────────────────────────────────────────────────────────────                                                                              
                                                                                                                                                               
 ### SCREEN: Staff shifts                                                                                                                                      
                                                                                                                                                               
 ROUTE: /staff-shifts                                                                                                                                          
                                                                                                                                                               
 PURPOSE: View, register and edit staff shift assignments.                                                                                                     
                                                                                                                                                               
 CURRENT STRENGTHS:                                                                                                                                            
 - Week/month views.                                                                                                                                           
 - Current-day treatment.                                                                                                                                      
 - Two registration modes.                                                                                                                                     
 - URL-driven tab/view state.                                                                                                                                  
 - Responsive row grid becomes one column below 920px.                                                                                                         
                                                                                                                                                               
 ISSUES:                                                                                                                                                       
 - 1,990-line monolith.                                                                                                                                        
 - Page-local neutral/emerald/rose Tailwind styling diverges from semantic MedLabs tokens.                                                                     
 - Repeated controls lack accessible labels.                                                                                                                   
 - Quick/edit dialogs lack focus containment and focus return.                                                                                                 
 - Time pickers in quick dialog lack ariaLabel.                                                                                                                
 - Event action targets are 24×28px.                                                                                                                           
 - Pending text uses "..." instead of “…” at several locations.                                                                                                
                                                                                                                                                               
 MOBILE:                                                                                                                                                       
 - Layout stacks, but action targets and repeated-row labelling remain weak.                                                                                   
                                                                                                                                                               
 ACCESSIBILITY:                                                                                                                                                
 - Major keyboard and form-name gaps.                                                                                                                          
                                                                                                                                                               
 DESIGN SYSTEM:                                                                                                                                                
 - Most visibly fragmented authenticated feature.                                                                                                              
                                                                                                                                                               
 RECOMMENDED DIRECTION:                                                                                                                                        
 - Keep workflows and calendar. Consolidate into existing field, modal, button and status patterns.                                                            
                                                                                                                                                               
 PRIORITY: P1                                                                                                                                                  
                                                                                                                                                               
 ────────────────────────────────────────────────────────────────────────────────                                                                              
                                                                                                                                                               
 ### SCREEN: Skills schedule creation and imports                                                                                                              
                                                                                                                                                               
 ROUTES: /schedule-entry/new, /schedule-entry/import, /imports                                                                                                 
                                                                                                                                                               
 PURPOSE: Create schedules manually or through validated imports.                                                                                              
                                                                                                                                                               
 CURRENT STRENGTHS:                                                                                                                                            
 - Numbered form sections.                                                                                                                                     
 - Five-step import flow.                                                                                                                                      
 - File preview and validation.                                                                                                                                
 - Clear pending states and pagination.                                                                                                                        
                                                                                                                                                               
 ISSUES:                                                                                                                                                       
 - Import history has ten desktop-oriented columns.                                                                                                            
 - Schedule and equipment import wizards duplicate substantial shell logic.                                                                                    
 - No route-level loading or error state.                                                                                                                      
                                                                                                                                                               
 MOBILE:                                                                                                                                                       
 - Form fields stack.                                                                                                                                          
 - Import stepper remains five columns at small widths and risks dense labels.                                                                                 
                                                                                                                                                               
 ACCESSIBILITY:                                                                                                                                                
 - Preview table wrappers are correctly named/focusable.                                                                                                       
 - Field errors remain mostly summary-level.                                                                                                                   
                                                                                                                                                               
 DESIGN SYSTEM:                                                                                                                                                
 - Strong Import Master worth preserving.                                                                                                                      
                                                                                                                                                               
 RECOMMENDED DIRECTION:                                                                                                                                        
 - Consolidate wizard shell; preserve domain validation and five-step model.                                                                                   
                                                                                                                                                               
 PRIORITY: P2                                                                                                                                                  
                                                                                                                                                               
 ────────────────────────────────────────────────────────────────────────────────                                                                              
                                                                                                                                                               
 ### SCREEN: Open and owned classes                                                                                                                            
                                                                                                                                                               
 ROUTES: /classes/open, /classes/mine                                                                                                                          
                                                                                                                                                               
 PURPOSE: Discover, claim, assign and manage classes.                                                                                                          
                                                                                                                                                               
 CURRENT STRENGTHS:                                                                                                                                            
 - One shared component for both modes.                                                                                                                        
 - Filters, URL range, export, pagination and status feedback.                                                                                                 
 - Focusable, labelled scroll viewport.                                                                                                                        
 - Action confirmation uses ConfirmDialog.                                                                                                                     
                                                                                                                                                               
 ISSUES:                                                                                                                                                       
 - Eight-column table pushes primary actions far right on mobile.                                                                                              
 - SearchableCombobox lacks standard arrow navigation.                                                                                                         
                                                                                                                                                               
 MOBILE:                                                                                                                                                       
 - Current 1040px table requires substantial lateral travel.                                                                                                   
                                                                                                                                                               
 ACCESSIBILITY:                                                                                                                                                
 - Table region is strong.                                                                                                                                     
 - Combobox keyboard behavior is the main gap.                                                                                                                 
                                                                                                                                                               
 DESIGN SYSTEM:                                                                                                                                                
 - Good representative pilot.                                                                                                                                  
                                                                                                                                                               
 RECOMMENDED DIRECTION:                                                                                                                                        
 - Preserve table on desktop; use column priority on mobile.                                                                                                   
                                                                                                                                                               
 PRIORITY: P1                                                                                                                                                  
                                                                                                                                                               
 ────────────────────────────────────────────────────────────────────────────────                                                                              
                                                                                                                                                               
 ### SCREEN: Skills equipment registration                                                                                                                     
                                                                                                                                                               
 ROUTE: /equipment/register                                                                                                                                    
                                                                                                                                                               
 PURPOSE: Create, edit or copy equipment requests.                                                                                                             
                                                                                                                                                               
 CURRENT STRENGTHS:                                                                                                                                            
 - Clear business grouping.                                                                                                                                    
 - Good pending labels.                                                                                                                                        
 - Late-registration warning and validation.                                                                                                                   
 - Consistent numbered sections.                                                                                                                               
                                                                                                                                                               
 ISSUES:                                                                                                                                                       
 - 1,007-line client component.                                                                                                                                
 - Editable item table is difficult on phone.                                                                                                                  
 - Unit/quantity/note row controls depend heavily on table context for naming.                                                                                 
 - Error messages are not consistently field-associated.                                                                                                       
                                                                                                                                                               
 MOBILE:                                                                                                                                                       
 - Outer form stacks, but editable table remains wide.                                                                                                         
                                                                                                                                                               
 ACCESSIBILITY:                                                                                                                                                
 - Required workflow is generally keyboard operable until signature later in lifecycle.                                                                        
                                                                                                                                                               
 DESIGN SYSTEM:                                                                                                                                                
 - Good form foundation.                                                                                                                                       
                                                                                                                                                               
 RECOMMENDED DIRECTION:                                                                                                                                        
 - Keep desktop table; use repeated item cards or condensed row editor on phone.                                                                               
                                                                                                                                                               
 PRIORITY: P1                                                                                                                                                  
                                                                                                                                                               
 ────────────────────────────────────────────────────────────────────────────────                                                                              
                                                                                                                                                               
 ### SCREEN: Equipment operations and user requests                                                                                                            
                                                                                                                                                               
 ROUTES: /equipment/requests, /equipment/mine                                                                                                                  
                                                                                                                                                               
 PURPOSE: Review, approve, hand over, return and inspect requests.                                                                                             
                                                                                                                                                               
 CURRENT STRENGTHS:                                                                                                                                            
 - Unified domain table.                                                                                                                                       
 - Stable status actions.                                                                                                                                      
 - Expandable detail concept.                                                                                                                                  
 - Pagination and filters.                                                                                                                                     
 - Confirmation dialog for destructive actions.                                                                                                                
                                                                                                                                                               
 ISSUES:                                                                                                                                                       
 - 1,706-line component.                                                                                                                                       
 - Item and signature modals do not trap focus.                                                                                                                
 - Signature input is pointer-only.                                                                                                                            
 - Signature close button at components/equipment-request-list.tsx:665-670 has only ×, not a meaningful accessible name.                                       
 - Some modal table viewports are not keyboard-focusable.                                                                                                      
                                                                                                                                                               
 MOBILE:                                                                                                                                                       
 - Summary table and expanded details create substantial lateral travel.                                                                                       
                                                                                                                                                               
 ACCESSIBILITY:                                                                                                                                                
 - Pointer-only signature blocks core keyboard use.                                                                                                            
                                                                                                                                                               
 DESIGN SYSTEM:                                                                                                                                                
 - Preserve expandable-detail direction.                                                                                                                       
                                                                                                                                                               
 RECOMMENDED DIRECTION:                                                                                                                                        
 - Fix signature and overlay foundations before visual refinements.                                                                                            
                                                                                                                                                               
 PRIORITY: P0                                                                                                                                                  
                                                                                                                                                               
 ────────────────────────────────────────────────────────────────────────────────                                                                              
                                                                                                                                                               
 ### SCREEN: Basic Medical creation, registrations and evidence                                                                                                
                                                                                                                                                               
 ROUTES: /basic-medical/new, /basic-medical/registrations, confirmation evidence route                                                                         
                                                                                                                                                               
 PURPOSE: Register multiple sessions, manage confirmations and preserve historical evidence.                                                                   
                                                                                                                                                               
 CURRENT STRENGTHS:                                                                                                                                            
 - Approved distinct business layout.                                                                                                                          
 - Existing collapsed/expanded registration concept.                                                                                                           
 - Evidence is appropriately document-oriented.                                                                                                                
 - Session and equipment condition information remains explicit.                                                                                               
                                                                                                                                                               
 ISSUES:                                                                                                                                                       
 - Session row editors are table-first on mobile.                                                                                                              
 - Confirmation canvas is pointer-only: components/basic-medical-registration-list.tsx:370-423.                                                                
 - Confirmation modal lacks complete focus containment.                                                                                                        
 - Several nested table viewports are not focusable.                                                                                                           
 - Large 1,347-line registration component.                                                                                                                    
                                                                                                                                                               
 MOBILE:                                                                                                                                                       
 - Main registration table remains 980px wide.                                                                                                                 
 - Existing expandable model is correct, but collapsed summaries need mobile condensation.                                                                     
                                                                                                                                                               
 ACCESSIBILITY:                                                                                                                                                
 - Signature is a core blocker.                                                                                                                                
                                                                                                                                                               
 DESIGN SYSTEM:                                                                                                                                                
 - Preserve business-specific layout and evidence exception.                                                                                                   
                                                                                                                                                               
 RECOMMENDED DIRECTION:                                                                                                                                        
 - Do not force Skills form structure. Improve shared fields, table behavior and accessible confirmation.                                                      
                                                                                                                                                               
 PRIORITY: P0                                                                                                                                                  
                                                                                                                                                               
 ────────────────────────────────────────────────────────────────────────────────                                                                              
                                                                                                                                                               
 ### SCREEN: Basic Medical equipment                                                                                                                           
                                                                                                                                                               
 ROUTES: /basic-medical/equipment, /basic-medical/equipment-requests                                                                                           
                                                                                                                                                               
 PURPOSE: Manage catalog, room inventory, damaged equipment, logs and requests.                                                                                
                                                                                                                                                               
 CURRENT STRENGTHS:                                                                                                                                            
 - Domain tabs.                                                                                                                                                
 - Existing catalog/action patterns.                                                                                                                           
 - Local table scrolling.                                                                                                                                      
 - Good empty-state copy.                                                                                                                                      
 - Management capabilities are clearly separated.                                                                                                              
                                                                                                                                                               
 ISSUES:                                                                                                                                                       
 - Filter selects and actor input lack labels at app/basic-medical/equipment/page.tsx:167-195.                                                                 
 - Four separate wide table modes use the same default mobile strategy.                                                                                        
 - Several table scroll containers are not keyboard-focusable.                                                                                                 
 - Editable item table remains difficult on phone.                                                                                                             
                                                                                                                                                               
 MOBILE:                                                                                                                                                       
 - Filters stack.                                                                                                                                              
 - Inventory and damage tables need column priority or summary/detail.                                                                                         
                                                                                                                                                               
 ACCESSIBILITY:                                                                                                                                                
 - Missing filter names are a major issue.                                                                                                                     
                                                                                                                                                               
 DESIGN SYSTEM:                                                                                                                                                
 - Strong existing table and status language.                                                                                                                  
                                                                                                                                                               
 RECOMMENDED DIRECTION:                                                                                                                                        
 - Formalize labelled filters and per-table mobile strategies.                                                                                                 
                                                                                                                                                               
 PRIORITY: P1                                                                                                                                                  
                                                                                                                                                               
 ────────────────────────────────────────────────────────────────────────────────                                                                              
                                                                                                                                                               
 ### SCREEN: Personnel                                                                                                                                         
                                                                                                                                                               
 ROUTE: /admin/personnel                                                                                                                                       
                                                                                                                                                               
 PURPOSE: Manage personnel, permissions, scope, status and password reconciliation.                                                                            
                                                                                                                                                               
 CURRENT STRENGTHS:                                                                                                                                            
 - Approved eight-column personnel table.                                                                                                                      
 - Drawer uses semantic fieldsets.                                                                                                                             
 - Sticky header/body/footer structure.                                                                                                                        
 - Permission restrictions are explained.                                                                                                                      
 - Pagination.                                                                                                                                                 
                                                                                                                                                               
 ISSUES:                                                                                                                                                       
 - Up to 50 rows are followed by one Auth lookup and one profile query per row: potentially 100 additional requests per page at                                
   app/admin/personnel/page.tsx:68-90.                                                                                                                         
 - No route-level loading UI while these requests complete.                                                                                                    
 - Drawer uses custom overlay/focus handling.                                                                                                                  
 - Mobile table requires 1180px.                                                                                                                               
 - Error association is summary-level.                                                                                                                         
                                                                                                                                                               
 MOBILE:                                                                                                                                                       
 - Full-width drawer is appropriate.                                                                                                                           
 - Table should become identity/status summary leading to the drawer.                                                                                          
                                                                                                                                                               
 ACCESSIBILITY:                                                                                                                                                
 - Fieldsets are good; overlay focus needs consolidation.                                                                                                      
                                                                                                                                                               
 DESIGN SYSTEM:                                                                                                                                                
 - Personnel table remains the visual table-shell reference.                                                                                                   
                                                                                                                                                               
 RECOMMENDED DIRECTION:                                                                                                                                        
 - Preserve table/drawer visual reference; optimize server fan-out and mobile summary.                                                                         
                                                                                                                                                               
 PRIORITY: P1                                                                                                                                                  
                                                                                                                                                               
 ────────────────────────────────────────────────────────────────────────────────                                                                              
                                                                                                                                                               
 ### SCREEN: Catalogs                                                                                                                                          
                                                                                                                                                               
 ROUTES: /admin/equipment, /admin/courses, /admin/rooms                                                                                                        
                                                                                                                                                               
 PURPOSE: Maintain equipment, courses, rooms and room types.                                                                                                   
                                                                                                                                                               
 CURRENT STRENGTHS:                                                                                                                                            
 - Stable bulk action positions.                                                                                                                               
 - Shared course/room manager.                                                                                                                                 
 - Manual add forms are collapsed by default.                                                                                                                  
 - Import preview exists.                                                                                                                                      
 - Equipment column intent follows the Master.                                                                                                                 
                                                                                                                                                               
 ISSUES:                                                                                                                                                       
 - No shared DataTable component despite repeated shells.                                                                                                      
 - Course/room/equipment implementations still vary.                                                                                                           
 - Wide action groups and tables are demanding on mobile.                                                                                                      
 - Multiple import components split similar behavior.                                                                                                          
                                                                                                                                                               
 MOBILE:                                                                                                                                                       
 - Catalog equipment should remain horizontally comparative.                                                                                                   
 - Course/room catalogs can hide nonapplicable columns.                                                                                                        
                                                                                                                                                               
 ACCESSIBILITY:                                                                                                                                                
 - Some tables are named/focusable; consistency is incomplete.                                                                                                 
                                                                                                                                                               
 DESIGN SYSTEM:                                                                                                                                                
 - Good foundation for consolidation, not replacement.                                                                                                         
                                                                                                                                                               
 RECOMMENDED DIRECTION:                                                                                                                                        
 - Use equipment catalog as the family reference; unify other catalogs incrementally.                                                                          
                                                                                                                                                               
 PRIORITY: P2                                                                                                                                                  
                                                                                                                                                               
 ────────────────────────────────────────────────────────────────────────────────                                                                              
                                                                                                                                                               
 ### SCREEN: Email notifications and audit                                                                                                                     
                                                                                                                                                               
 ROUTES: /email-notifications, /admin/audit                                                                                                                    
                                                                                                                                                               
 PURPOSE: Monitor delivery operations and system changes.                                                                                                      
                                                                                                                                                               
 CURRENT STRENGTHS:                                                                                                                                            
 - Semantic status text.                                                                                                                                       
 - URL pagination.                                                                                                                                             
 - Focusable, labelled table regions.                                                                                                                          
 - Admin access boundaries are clear.                                                                                                                          
                                                                                                                                                               
 ISSUES:                                                                                                                                                       
 - Email table has eight columns and long message/error content.                                                                                               
 - Empty/error recovery remains minimal.                                                                                                                       
 - Audit detail IDs add mobile width without being primary information.                                                                                        
                                                                                                                                                               
 MOBILE:                                                                                                                                                       
 - Email log benefits from summary/detail.                                                                                                                     
 - Audit log can retain local scrolling.                                                                                                                       
                                                                                                                                                               
 ACCESSIBILITY:                                                                                                                                                
 - Stronger than several other table screens.                                                                                                                  
                                                                                                                                                               
 DESIGN SYSTEM:                                                                                                                                                
 - Consistent data-table foundation.                                                                                                                           
                                                                                                                                                               
 RECOMMENDED DIRECTION:                                                                                                                                        
 - Improve content prioritization and recovery states; keep visual language.                                                                                   
                                                                                                                                                               
 PRIORITY: P2                                                                                                                                                  
                                                                                                                                                               
 ────────────────────────────────────────────────────────────────────────────────                                                                              
                                                                                                                                                               
 9. ACCESSIBILITY                                                                                                                                              
                                                                                                                                                               
 ### CRITICAL                                                                                                                                                  
                                                                                                                                                               
 1. Pointer-only required signatures                                                                                                                           
   - components/equipment-request-list.tsx:679-724                                                                                                             
   - components/basic-medical-registration-list.tsx:370-423                                                                                                    
   - <canvas> accepts pointer events only.                                                                                                                     
   - No keyboard, text, upload, delegated confirmation or other accessible alternative is present.                                                             
   - This can block handover/return and Basic Medical confirmation.                                                                                            
   - Priority: P0                                                                                                                                              
                                                                                                                                                               
 ### MAJOR                                                                                                                                                     
                                                                                                                                                               
 1. Custom overlays do not consistently trap/restore focus                                                                                                     
   - Equipment item and signature modals.                                                                                                                      
   - Basic Medical confirmation modal.                                                                                                                         
   - Personnel drawer.                                                                                                                                         
   - Staff-shift dialogs.                                                                                                                                      
   - Mobile sidebar.                                                                                                                                           
   - ConfirmDialog is the working reference: components/confirm-dialog.tsx:68-113.                                                                             
 2. Combobox keyboard model incomplete                                                                                                                         
   - components/searchable-combobox.tsx:118-184                                                                                                                
   - No Arrow Up/Down active-option navigation.                                                                                                                
   - No aria-activedescendant.                                                                                                                                 
   - Options are portaled far from the input’s tab order.                                                                                                      
 3. Unlabelled Basic Medical filters                                                                                                                           
   - app/basic-medical/equipment/page.tsx:167-195                                                                                                              
   - Status, room, event and actor controls have no label or accessible name.                                                                                  
 4. Staff-shift repeated controls lack names                                                                                                                   
   - components/staff-shift-roster.tsx:1319-1338                                                                                                               
   - components/staff-shift-roster.tsx:1419-1474                                                                                                               
   - Quick-dialog time controls omit ariaLabel.                                                                                                                
 5. Form errors are weakly associated                                                                                                                          
   - TimePicker correctly supports aria-invalid and aria-describedby.                                                                                          
   - Other forms mostly expose generic status paragraphs without connecting the error to the affected field.                                                   
 6. Scrollable tables are inconsistently keyboard-focusable                                                                                                    
   - Several wrappers correctly use role="region" and tabIndex={0}.                                                                                            
   - Others are plain div.responsive-table, including editable forms and Basic Medical inventory tables.                                                       
 7. Touch targets                                                                                                                                              
   - Staff-shift calendar action buttons are only 24×28px.                                                                                                     
                                                                                                                                                               
 ### MINOR                                                                                                                                                     
                                                                                                                                                               
 1. /login lacks an <h1>.                                                                                                                                      
 2. One signature close button is named only ×.                                                                                                                
 3. Muted login copy measured at 4.28:1.                                                                                                                       
 4. Several 10–11px content labels remain.                                                                                                                     
 5. No explicit pressed-state styling (:active or aria-pressed) was found for the shared button system.                                                        
                                                                                                                                                               
 ### GOOD                                                                                                                                                      
                                                                                                                                                               
 - <html lang="vi">.                                                                                                                                           
 - Global skip link.                                                                                                                                           
 - Shared authenticated pages receive a semantic <h1>.                                                                                                         
 - Real <button>, <Link>, <nav>, <main> and <table> elements dominate.                                                                                         
 - Heroicons are decorative by default.                                                                                                                        
 - Global :focus-visible treatment exists.                                                                                                                     
 - Compound controls have a one-shell focus contract.                                                                                                          
 - Reduced-motion rules exist.                                                                                                                                 
 - ConfirmDialog has initial focus, Escape handling, focus trap and focus restoration.                                                                         
 - Status badges include text rather than relying only on color.                                                                                               
 - Rendered /login axe scan found no definite WCAG A/AA violation; contrast required manual review.                                                            
                                                                                                                                                               
 ────────────────────────────────────────────────────────────────────────────────                                                                              
                                                                                                                                                               
 10. COMPONENT ARCHITECTURE                                                                                                                                    
                                                                                                                                                               
 ### High-blast-radius components                                                                                                                              
                                                                                                                                                               
 ┌──────────────────────────────┬───────────────────────────────┬──────────────┬─────────────────────────────────────────────────────────┐                     
 │ Component / area             │ Consumers / size              │ Blast radius │ Evidence                                                │                     
 ├──────────────────────────────┼───────────────────────────────┼──────────────┼─────────────────────────────────────────────────────────┤                     
 │ app/globals.css              │ All screens; 11,600 lines     │ HIGH         │ Tokens, shell, table, form and legacy overrides coexist │                     
 ├──────────────────────────────┼───────────────────────────────┼──────────────┼─────────────────────────────────────────────────────────┤                     
 │ icons.tsx                    │ 29 direct consumers           │ HIGH         │ Central icon API; currently healthy                     │                     
 ├──────────────────────────────┼───────────────────────────────┼──────────────┼─────────────────────────────────────────────────────────┤                     
 │ WorkspaceShell               │ 21 direct consumers           │ HIGH         │ Navigation, sidebar, topbar, account and notifications  │                     
 ├──────────────────────────────┼───────────────────────────────┼──────────────┼─────────────────────────────────────────────────────────┤                     
 │ ConfirmDialog                │ 11 direct consumers           │ HIGH         │ Correct focus reference                                 │                     
 ├──────────────────────────────┼───────────────────────────────┼──────────────┼─────────────────────────────────────────────────────────┤                     
 │ SearchableCombobox           │ 7 direct consumers            │ HIGH         │ Keyboard changes affect major forms                     │                     
 ├──────────────────────────────┼───────────────────────────────┼──────────────┼─────────────────────────────────────────────────────────┤                     
 │ TimePicker                   │ 5 direct consumers            │ HIGH         │ Used in calendars/forms/shifts                          │                     
 ├──────────────────────────────┼───────────────────────────────┼──────────────┼─────────────────────────────────────────────────────────┤                     
 │ Pagination components        │ 13 combined direct consumers  │ MEDIUM       │ URL and local-state variants                            │                     
 ├──────────────────────────────┼───────────────────────────────┼──────────────┼─────────────────────────────────────────────────────────┤                     
 │ Dashboard                    │ 2 route families; 1,321 lines │ HIGH         │ Shared calendar modes                                   │                     
 ├──────────────────────────────┼───────────────────────────────┼──────────────┼─────────────────────────────────────────────────────────┤                     
 │ EquipmentRequestList         │ 2 routes; 1,706 lines         │ HIGH         │ Entire request lifecycle                                │                     
 ├──────────────────────────────┼───────────────────────────────┼──────────────┼─────────────────────────────────────────────────────────┤                     
 │ StaffShiftRoster             │ 1 route; 1,990 lines          │ MEDIUM       │ Single feature, very complex                            │                     
 ├──────────────────────────────┼───────────────────────────────┼──────────────┼─────────────────────────────────────────────────────────┤                     
 │ BasicMedicalRegistrationList │ 1 route; 1,347 lines          │ MEDIUM       │ Confirmation and sessions                               │                     
 └──────────────────────────────┴───────────────────────────────┴──────────────┴─────────────────────────────────────────────────────────┘                     
                                                                                                                                                               
 ### Duplicated patterns                                                                                                                                       
                                                                                                                                                               
 - Schedule/equipment import wizard shells.                                                                                                                    
 - Responsive table wrappers.                                                                                                                                  
 - Modal/backdrop/header/footer mechanics.                                                                                                                     
 - Status and action-feedback markup.                                                                                                                          
 - Pagination UI.                                                                                                                                              
 - Editable equipment row layouts.                                                                                                                             
 - Filter toolbar construction.                                                                                                                                
                                                                                                                                                               
 ### Potential primitives                                                                                                                                      
                                                                                                                                                               
 - TableScrollViewport                                                                                                                                         
 - DataTableShell                                                                                                                                              
 - ResponsiveToolbar                                                                                                                                           
 - FormField                                                                                                                                                   
 - FieldError                                                                                                                                                  
 - DialogShell                                                                                                                                                 
 - DrawerShell                                                                                                                                                 
 - StatusBadge                                                                                                                                                 
 - FeedbackMessage                                                                                                                                             
 - EmptyState                                                                                                                                                  
 - AsyncState                                                                                                                                                  
 - ImportWizardShell                                                                                                                                           
 - Shared pagination view                                                                                                                                      
                                                                                                                                                               
 ### Composition/API concerns                                                                                                                                  
                                                                                                                                                               
 1. Dashboard mode flags — HIGH                                                                                                                                
   - 19 props.                                                                                                                                                 
   - Calendar domain behavior, navigation, drawer editing and permissions in one component.                                                                    
   - Later direction: explicit Skills/Basic Medical adapters around shared calendar parts.                                                                     
 2. Workspace capability props — MEDIUM                                                                                                                        
   - Centralization is good.                                                                                                                                   
   - Additional booleans will increase conditional navigation coupling.                                                                                        
 3. Large lifecycle components — MEDIUM                                                                                                                        
   - Equipment and registration components combine filtering, mutation, overlays, tables and domain state.                                                     
   - Extraction should follow cohesive boundaries only.                                                                                                        
 4. ConfirmDialog — LOW                                                                                                                                        
   - Boolean props represent legitimate state, not visual customization proliferation.                                                                         
   - Tone is an explicit union.                                                                                                                                
   - Keep.                                                                                                                                                     
 5. No typed UI component layer — MEDIUM                                                                                                                       
   - CSS classes are the actual design system.                                                                                                                 
   - This is workable, but structure and accessibility contracts cannot be enforced reliably.                                                                  
                                                                                                                                                               
 ────────────────────────────────────────────────────────────────────────────────                                                                              
                                                                                                                                                               
 11. PERFORMANCE / PERCEIVED UX                                                                                                                                
                                                                                                                                                               
 ### Supported strengths                                                                                                                                       
                                                                                                                                                               
 - Server components handle initial data loading.                                                                                                              
 - Major route queries often use Promise.all.                                                                                                                  
 - XLSX is dynamically imported for catalog export/import interactions.                                                                                        
 - Lists use shared pagination at 50 rows per page.                                                                                                            
 - URL state is used for calendar views, filters, tabs and pagination.                                                                                         
 - Heavy import dependencies are mostly confined to import screens.                                                                                            
                                                                                                                                                               
 ### Supported issues                                                                                                                                          
                                                                                                                                                               
 1. Personnel request fan-out — P1                                                                                                                             
   - Up to 50 rows.                                                                                                                                            
   - One Auth Admin lookup plus one profile lookup per row.                                                                                                    
   - Potentially 100 additional server requests: app/admin/personnel/page.tsx:68-90.                                                                           
   - Directly affects initial page response.                                                                                                                   
 2. No route loading boundaries — P2                                                                                                                           
   - No loading.tsx found.                                                                                                                                     
   - Authenticated pages wait for all server work before displaying route content.                                                                             
 3. No route error boundaries — P2                                                                                                                             
   - No error.tsx found.                                                                                                                                       
   - Request failures rely on framework fallback or local handling.                                                                                            
 4. Lifecycle history can remain in perpetual loading — P2                                                                                                     
   - components/equipment-request-lifecycle-history.tsx:51-63 sets loaded only in the resolved callback and does not surface RPC errors.                       
 5. Large client boundaries — P2                                                                                                                               
   - Dashboard, staff shifts, equipment request list and Basic Medical registration list are broad client components.                                          
   - State changes can rerender substantial interactive trees.                                                                                                 
   - Pagination limits table impact, so this is an architecture risk rather than a demonstrated runtime emergency.                                             
 6. Global CSS complexity — P2                                                                                                                                 
   - 11,600 lines and extensive repeated selectors increase style recalculation and, more importantly, maintenance and regression risk.                        
   - No claim is made that CSS size is currently the dominant runtime bottleneck.                                                                              
                                                                                                                                                               
 ────────────────────────────────────────────────────────────────────────────────                                                                              
                                                                                                                                                               
 12. DESIGN SYSTEM MATURITY                                                                                                                                    
                                                                                                                                                               
 These scores are audit heuristics, not scientific measurements.                                                                                               
                                                                                                                                                               
 ┌─────────────────────┬───────────┬───────────────────────────────────────────────────────────────────────────────┬─────────────────────────────────────────┐ 
 │ Area                │ Score 1–5 │ Evidence                                                                      │ Direction                               │ 
 ├─────────────────────┼───────────┼───────────────────────────────────────────────────────────────────────────────┼─────────────────────────────────────────┤ 
 │ Color consistency   │ 3         │ Strong brand palette and semantic aliases; 185 unique CSS hex values          │ Consolidate token generations           │ 
 ├─────────────────────┼───────────┼───────────────────────────────────────────────────────────────────────────────┼─────────────────────────────────────────┤ 
 │ Typography          │ 3         │ Correct font and page hierarchy; 38 size expressions and tiny legacy text     │ Formalize roles, remove undersized      │ 
 │                     │           │                                                                               │ content                                 │ 
 ├─────────────────────┼───────────┼───────────────────────────────────────────────────────────────────────────────┼─────────────────────────────────────────┤ 
 │ Spacing             │ 3         │ Dense, usable core rhythm; 45 pixel values                                    │ Reduce unsupported exceptions           │ 
 ├─────────────────────┼───────────┼───────────────────────────────────────────────────────────────────────────────┼─────────────────────────────────────────┤ 
 │ Components          │ 3         │ Strong shell/dialog/icons; weak primitive enforcement                         │ Add structural primitives incrementally │ 
 ├─────────────────────┼───────────┼───────────────────────────────────────────────────────────────────────────────┼─────────────────────────────────────────┤ 
 │ Forms               │ 3         │ Good sectioning and responsive grids; weak errors/labels in some workflows    │ Shared field/error contract             │ 
 ├─────────────────────┼───────────┼───────────────────────────────────────────────────────────────────────────────┼─────────────────────────────────────────┤ 
 │ Tables              │ 3         │ Excellent written/visual contract; repeated markup and one default mobile     │ Shared shell plus per-table mobile      │ 
 │                     │           │ strategy                                                                      │ intent                                  │ 
 ├─────────────────────┼───────────┼───────────────────────────────────────────────────────────────────────────────┼─────────────────────────────────────────┤ 
 │ Navigation          │ 4         │ Centralized, branded, role-aware, responsive                                  │ Add focus containment                   │ 
 ├─────────────────────┼───────────┼───────────────────────────────────────────────────────────────────────────────┼─────────────────────────────────────────┤ 
 │ Responsive design   │ 3         │ Intentional shell/form/calendar rules; broken auth auxiliaries and table      │ Repair high-impact workflows            │ 
 │                     │           │ friction                                                                      │                                         │ 
 ├─────────────────────┼───────────┼───────────────────────────────────────────────────────────────────────────────┼─────────────────────────────────────────┤ 
 │ Accessibility       │ 2         │ Strong fundamentals; core signature blocker and overlay gaps                  │ P0/P1 remediation                       │ 
 ├─────────────────────┼───────────┼───────────────────────────────────────────────────────────────────────────────┼─────────────────────────────────────────┤ 
 │ Interaction states  │ 3         │ Hover/focus/disabled/loading are common                                       │ Add pressed state and unify custom      │ 
 │                     │           │                                                                               │ controls                                │ 
 ├─────────────────────┼───────────┼───────────────────────────────────────────────────────────────────────────────┼─────────────────────────────────────────┤ 
 │ Loading/empty/error │ 2         │ Many local messages; no route boundaries and several passive empty states     │ Shared recoverable states               │ 
 ├─────────────────────┼───────────┼───────────────────────────────────────────────────────────────────────────────┼─────────────────────────────────────────┤ 
 │ Component reuse     │ 3         │ Several high-value shared components; import/modal/table duplication          │ Consolidate without wholesale rewrite   │ 
 └─────────────────────┴───────────┴───────────────────────────────────────────────────────────────────────────────┴─────────────────────────────────────────┘ 
                                                                                                                                                               
 ────────────────────────────────────────────────────────────────────────────────                                                                              
                                                                                                                                                               
 13. KEEP / IMPROVE / CONSOLIDATE / REPLACE                                                                                                                    
                                                                                                                                                               
 ### KEEP                                                                                                                                                      
                                                                                                                                                               
 - EIU blue/gold/cream palette.                                                                                                                                
 - Be Vietnam Pro.                                                                                                                                             
 - Sidebar gradient, logo and gold active marker.                                                                                                              
 - White sticky topbar.                                                                                                                                        
 - Page title hierarchy.                                                                                                                                       
 - KPI cards.                                                                                                                                                  
 - Dense desktop productivity direction.                                                                                                                       
 - Existing table appearance.                                                                                                                                  
 - Existing Calendar Master.                                                                                                                                   
 - Five-step Import Master.                                                                                                                                    
 - Numbered form sections.                                                                                                                                     
 - Document-style evidence screen.                                                                                                                             
 - Current /login visual.                                                                                                                                      
 - Heroicons wrapper.                                                                                                                                          
 - ConfirmDialog.                                                                                                                                              
 - Stable catalog action positions.                                                                                                                            
                                                                                                                                                               
 ### IMPROVE                                                                                                                                                   
                                                                                                                                                               
 - Mobile column prioritization.                                                                                                                               
 - Form labels and field errors.                                                                                                                               
 - Sidebar and drawer focus handling.                                                                                                                          
 - Staff-shift touch targets and visual consistency.                                                                                                           
 - Auth recovery/reset composition.                                                                                                                            
 - Empty/error/loading recovery.                                                                                                                               
 - Button pressed state.                                                                                                                                       
 - Secondary text contrast.                                                                                                                                    
 - Mobile dialog field layout.                                                                                                                                 
                                                                                                                                                               
 ### CONSOLIDATE                                                                                                                                               
                                                                                                                                                               
 - Legacy and semantic token layers.                                                                                                                           
 - Global CSS cascade.                                                                                                                                         
 - Table scroll/shell structure.                                                                                                                               
 - Import wizard shells.                                                                                                                                       
 - Dialog and drawer mechanics.                                                                                                                                
 - Pagination presentation.                                                                                                                                    
 - Feedback/status markup.                                                                                                                                     
 - Form field/error markup.                                                                                                                                    
 - Responsive toolbars.                                                                                                                                        
 - Staff-shift page-local tokens into existing semantic tokens.                                                                                                
                                                                                                                                                               
 ### REPLACE                                                                                                                                                   
                                                                                                                                                               
 Only three failing patterns have replacement-level evidence:                                                                                                  
                                                                                                                                                               
 1. Pointer-only signature input                                                                                                                               
   - Replace with an accessible multimodal confirmation/signature interaction.                                                                                 
 2. Legacy recovery/reset page shell                                                                                                                           
   - Replace its composition with the existing approved auth shell, not a new visual design.                                                                   
 3. Dead or misleading controls                                                                                                                                
   - Replace Xem tất cả with a real link/action or remove it.                                                                                                  
   - Either implement “remember login” behavior or remove the checkbox.                                                                                        
                                                                                                                                                               
 No frontend, framework, Tailwind or brand-wide replacement is justified.                                                                                      
                                                                                                                                                               
 ────────────────────────────────────────────────────────────────────────────────                                                                              
                                                                                                                                                               
 14. MASTER IMPROVEMENT MATRIX                                                                                                                                 
                                                                                                                                                               
 ┌─────────────┬────────────────┬───────────────────┬─────────────────────────┬─────────────────┬──────────────────┬──────────┬────────┬─────────────────────┐ 
 │ ID          │ Area           │ Problem           │ Evidence                │ Impact          │ Scope            │ Priority │ Effort │ Dependencies        │ 
 ├─────────────┼────────────────┼───────────────────┼─────────────────────────┼─────────────────┼──────────────────┼──────────┼────────┼─────────────────────┤ 
 │ A11Y-01     │ Accessibility  │ Required          │ Two canvas              │ Blocks keyboard │ Two lifecycle    │ P0       │ L      │ Business-approved   │ 
 │             │                │ signatures are    │ implementations with    │ users from core │ families         │          │        │ alternative         │ 
 │             │                │ pointer-only      │ pointer handlers only   │ confirmations   │                  │          │        │ signature contract  │ 
 ├─────────────┼────────────────┼───────────────────┼─────────────────────────┼─────────────────┼──────────────────┼──────────┼────────┼─────────────────────┤ 
 │ AUTH-01     │ Responsive /   │ Recovery/reset    │ Rendered broken at 375  │ Credential      │ 3 routes         │ P1       │ S      │ Existing login      │ 
 │             │ Visual         │ pages use         │ and 1440                │ recovery        │                  │          │        │ shell               │ 
 │             │                │ obsolete auth     │                         │ appears         │                  │          │        │                     │ 
 │             │                │ composition       │                         │ unfinished and  │                  │          │        │                     │ 
 │             │                │                   │                         │ cramped         │                  │          │        │                     │ 
 ├─────────────┼────────────────┼───────────────────┼─────────────────────────┼─────────────────┼──────────────────┼──────────┼────────┼─────────────────────┤ 
 │ A11Y-02     │ Overlays       │ Custom            │ Only ConfirmDialog      │ Keyboard users  │ Multiple         │ P1       │ M      │ Shared              │ 
 │             │                │ dialogs/drawers   │ traps/restores focus    │ can leave modal │ features         │          │        │ dialog/drawer shell │ 
 │             │                │ lack shared focus │                         │ context         │                  │          │        │                     │ 
 │             │                │ handling          │                         │                 │                  │          │        │                     │ 
 ├─────────────┼────────────────┼───────────────────┼─────────────────────────┼─────────────────┼──────────────────┼──────────┼────────┼─────────────────────┤ 
 │ A11Y-03     │ Inputs         │ Combobox lacks    │ No active option or     │ Slower or       │ 7 consumers      │ P1       │ M      │ SearchableCombobox  │ 
 │             │                │ arrow navigation  │ aria-activedescendant   │ impractical     │                  │          │        │                     │ 
 │             │                │                   │                         │ keyboard        │                  │          │        │                     │ 
 │             │                │                   │                         │ selection       │                  │          │        │                     │ 
 ├─────────────┼────────────────┼───────────────────┼─────────────────────────┼─────────────────┼──────────────────┼──────────┼────────┼─────────────────────┤ 
 │ A11Y-04     │ Forms          │ Filters and       │ Basic Medical filters   │ Ambiguous       │ Several screens  │ P1       │ M      │ Form field contract │ 
 │             │                │ repeated-row      │ and staff-shift rows    │ screen-reader   │                  │          │        │                     │ 
 │             │                │ controls lack     │                         │ fields          │                  │          │        │                     │ 
 │             │                │ names             │                         │                 │                  │          │        │                     │ 
 ├─────────────┼────────────────┼───────────────────┼─────────────────────────┼─────────────────┼──────────────────┼──────────┼────────┼─────────────────────┤ 
 │ MOB-01      │ Tables         │ Horizontal        │ 23 responsive-table     │ Core actions    │ Cross-feature    │ P1       │ L      │ Per-table strategy  │ 
 │             │                │ scrolling is the  │ wrappers                │ and priority    │                  │          │        │                     │ 
 │             │                │ default for       │                         │ data require    │                  │          │        │                     │ 
 │             │                │ nearly every      │                         │ lateral travel  │                  │          │        │                     │ 
 │             │                │ table             │                         │                 │                  │          │        │                     │ 
 ├─────────────┼────────────────┼───────────────────┼─────────────────────────┼─────────────────┼──────────────────┼──────────┼────────┼─────────────────────┤ 
 │ TOUCH-01    │ Mobile         │ Staff-shift       │ CSS lines 9155–9170     │ Error-prone     │ Staff shifts     │ P1       │ XS     │ Existing            │ 
 │             │                │ actions are       │                         │ touch           │                  │          │        │ button/icon policy  │ 
 │             │                │ 24×28px           │                         │ interaction     │                  │          │        │                     │ 
 ├─────────────┼────────────────┼───────────────────┼─────────────────────────┼─────────────────┼──────────────────┼──────────┼────────┼─────────────────────┤ 
 │ PERF-01     │ Performance    │ Personnel page    │ Up to 100 additional    │ Slow personnel  │ One high-value   │ P1       │ M      │ Existing            │ 
 │             │                │ performs per-row  │ requests                │ page response   │ screen           │          │        │ server/data         │ 
 │             │                │ Auth/profile      │                         │                 │                  │          │        │ contracts           │ 
 │             │                │ calls             │                         │                 │                  │          │        │                     │ 
 ├─────────────┼────────────────┼───────────────────┼─────────────────────────┼─────────────────┼──────────────────┼──────────┼────────┼─────────────────────┤ 
 │ DS-01       │ Design System  │ Two token         │ CSS root blocks at      │ High regression │ Global           │ P1       │ L      │ Visual regression   │ 
 │             │                │ generations and   │ lines 3 and 10251       │ and drift risk  │                  │          │        │ coverage            │ 
 │             │                │ 185 unique colors │                         │                 │                  │          │        │                     │ 
 ├─────────────┼────────────────┼───────────────────┼─────────────────────────┼─────────────────┼──────────────────┼──────────┼────────┼─────────────────────┤ 
 │ DS-02       │ CSS            │ 11,600-line       │ 248 repeated exact      │ Hard to predict │ Global           │ P1       │ XL     │ DS-01 and           │ 
 │             │ Architecture   │ global stylesheet │ selector strings        │ cascade and     │                  │          │        │ screenshot          │ 
 │             │                │ with repeated     │                         │ blast radius    │                  │          │        │ baselines           │ 
 │             │                │ selectors         │                         │                 │                  │          │        │                     │ 
 ├─────────────┼────────────────┼───────────────────┼─────────────────────────┼─────────────────┼──────────────────┼──────────┼────────┼─────────────────────┤ 
 │ TABLE-01    │ Accessibility  │ Scroll viewports  │ Mixed plain and         │ Keyboard users  │ 17 files         │ P1       │ M      │ Shared viewport     │ 
 │             │                │ inconsistently    │ labelled wrappers       │ cannot reliably │                  │          │        │ primitive           │ 
 │             │                │ focusable/named   │                         │ scroll wide     │                  │          │        │                     │ 
 │             │                │                   │                         │ tables          │                  │          │        │                     │ 
 ├─────────────┼────────────────┼───────────────────┼─────────────────────────┼─────────────────┼──────────────────┼──────────┼────────┼─────────────────────┤ 
 │ FORM-01     │ Forms          │ Errors rarely     │ Only TimePicker         │ Poor recovery   │ Cross-feature    │ P2       │ L      │ Form field          │ 
 │             │                │ connect to        │ consistently supports   │ and             │                  │          │        │ primitive           │ 
 │             │                │ affected fields   │ invalid/describedby     │ screen-reader   │                  │          │        │                     │ 
 │             │                │                   │                         │ context         │                  │          │        │                     │ 
 ├─────────────┼────────────────┼───────────────────┼─────────────────────────┼─────────────────┼──────────────────┼──────────┼────────┼─────────────────────┤ 
 │ ARCH-01     │ Architecture   │ Import wizard     │ 0.66 normalized         │ Drift and       │ Two wizard       │ P2       │ M      │ Stable import       │ 
 │             │                │ shell duplication │ similarity; 73% class   │ duplicated      │ families         │          │        │ contracts           │ 
 │             │                │                   │ overlap                 │ fixes           │                  │          │        │                     │ 
 ├─────────────┼────────────────┼───────────────────┼─────────────────────────┼─────────────────┼──────────────────┼──────────┼────────┼─────────────────────┤ 
 │ ARCH-02     │ Architecture   │ Large mode-driven │ 1,321–1,990-line        │ Change risk and │ Four features    │ P2       │ L      │ Extract only        │ 
 │             │                │ client components │ components              │ broad rerenders │                  │          │        │ cohesive boundaries │ 
 ├─────────────┼────────────────┼───────────────────┼─────────────────────────┼─────────────────┼──────────────────┼──────────┼────────┼─────────────────────┤ 
 │ STATE-01    │ Async UX       │ No route          │ No loading.tsx or       │ Blank           │ Application-wide │ P2       │ M      │ Existing error      │ 
 │             │                │ loading/error     │ error.tsx               │ wait/framework  │                  │          │        │ language            │ 
 │             │                │ boundaries        │                         │ fallback        │                  │          │        │                     │ 
 ├─────────────┼────────────────┼───────────────────┼─────────────────────────┼─────────────────┼──────────────────┼──────────┼────────┼─────────────────────┤ 
 │ STATE-02    │ Async UX       │ Lifecycle history │ Promise resolution only │ Perpetual “Đang │ Equipment detail │ P2       │ XS     │ Local RPC error     │ 
 │             │                │ has no failure    │                         │ tải”            │                  │          │        │ handling            │ 
 │             │                │ path              │                         │                 │                  │          │        │                     │ 
 ├─────────────┼────────────────┼───────────────────┼─────────────────────────┼─────────────────┼──────────────────┼──────────┼────────┼─────────────────────┤ 
 │ INT-01      │ Interaction    │ Dead/misleading   │ Xem tất cả; remember    │ Broken          │ Dashboard/login  │ P2       │ XS     │ Product behavior    │ 
 │             │                │ controls          │ checkbox                │ expectation     │                  │          │        │ decision            │ 
 ├─────────────┼────────────────┼───────────────────┼─────────────────────────┼─────────────────┼──────────────────┼──────────┼────────┼─────────────────────┤ 
 │ TYPE-01     │ Typography     │ Tiny content      │ 6–11px declarations;    │ Readability and │ Several features │ P2       │ M      │ Typography role     │ 
 │             │                │ sizes remain      │ staff shift 10–11px     │ consistency     │                  │          │        │ audit               │ 
 ├─────────────┼────────────────┼───────────────────┼─────────────────────────┼─────────────────┼──────────────────┼──────────┼────────┼─────────────────────┤ 
 │ CONTRAST-01 │ Accessibility  │ Muted login copy  │ Rendered computed       │ Minor           │ Login            │ P2       │ XS     │ Existing foreground │ 
 │             │                │ is 4.28:1         │ measurement             │ readability     │                  │          │        │ tokens              │ 
 │             │                │                   │                         │ failure         │                  │          │        │                     │ 
 ├─────────────┼────────────────┼───────────────────┼─────────────────────────┼─────────────────┼──────────────────┼──────────┼────────┼─────────────────────┤ 
 │ Z-01        │ Layering       │ 23 z-index values │ Static CSS count        │ Future overlay  │ Global           │ P3       │ S      │ Overlay             │ 
 │             │                │                   │                         │ collision risk  │                  │          │        │ consolidation       │ 
 ├─────────────┼────────────────┼───────────────────┼─────────────────────────┼─────────────────┼──────────────────┼──────────┼────────┼─────────────────────┤ 
 │ INT-02      │ Interaction    │ No shared pressed │ No :active/aria-pressed │ Minor tactile   │ Global           │ P3       │ XS     │ Button contract     │ 
 │             │                │ state             │ style found             │ feedback gap    │                  │          │        │                     │ 
 └─────────────┴────────────────┴───────────────────┴─────────────────────────┴─────────────────┴──────────────────┴──────────┴────────┴─────────────────────┘ 
                                                                                                                                                               
 ────────────────────────────────────────────────────────────────────────────────                                                                              
                                                                                                                                                               
 15. TOP 10 IMPROVEMENTS                                                                                                                                       
                                                                                                                                                               
 1. Make signature/confirmation workflows keyboard-accessible.                                                                                                 
 2. Repair recovery/reset/change-password screens using the existing login visual family.                                                                      
 3. Consolidate modal, drawer and mobile-sidebar focus management.                                                                                             
 4. Complete SearchableCombobox keyboard behavior.                                                                                                             
 5. Define a shared, focusable TableScrollViewport and per-table mobile strategies.                                                                            
 6. Consolidate legacy/V2 tokens and remove obsolete CSS conflicts behind regression coverage.                                                                 
 7. Add accessible form-field/error contracts and label staff-shift/Basic Medical controls.                                                                    
 8. Reduce personnel-page per-row request fan-out.                                                                                                             
 9. Consolidate the two import wizard shells without combining domain validation.                                                                              
 10. Add recoverable loading/empty/error states and remove dead/misleading controls.                                                                           
                                                                                                                                                               
 ────────────────────────────────────────────────────────────────────────────────                                                                              
                                                                                                                                                               
 16. PROPOSED DESIGN SYSTEM FOUNDATION                                                                                                                         
                                                                                                                                                               
 ### Existing — formalize                                                                                                                                      
                                                                                                                                                               
 - Be Vietnam Pro semantic typography roles.                                                                                                                   
 - EIU blue/gold/cream semantic colors.                                                                                                                        
 - Existing spacing scale.                                                                                                                                     
 - Control/card/overlay radius policy.                                                                                                                         
 - Approved card and overlay shadows.                                                                                                                          
 - PageHeader.                                                                                                                                                 
 - WorkspaceShell.                                                                                                                                             
 - Button classes and tones.                                                                                                                                   
 - Numbered form sections.                                                                                                                                     
 - Data-table visual contract.                                                                                                                                 
 - Status badge/pill semantics.                                                                                                                                
 - ConfirmDialog.                                                                                                                                              
 - Five-step import flow.                                                                                                                                      
 - Responsive page gutters.                                                                                                                                    
 - 44px toolbar control rhythm.                                                                                                                                
                                                                                                                                                               
 ### Existing — consolidate                                                                                                                                    
                                                                                                                                                               
 - Legacy --eiu-*/--ink-* and V2 semantic aliases.                                                                                                             
 - --shadow-sm/md and --shadow-card.                                                                                                                           
 - Repeated responsive-table markup.                                                                                                                           
 - Modal/backdrop/header/footer variants.                                                                                                                      
 - PaginationLinks and PaginationControls presentation.                                                                                                        
 - Import wizard shell.                                                                                                                                        
 - Feedback and empty-state classes.                                                                                                                           
 - Staff-shift colors, cards, tabs and modal visuals.                                                                                                          
 - Repeated form section markup.                                                                                                                               
 - Z-index layers.                                                                                                                                             
                                                                                                                                                               
 ### New — justified                                                                                                                                           
                                                                                                                                                               
 - Accessible signature/confirmation input — core blocker.                                                                                                     
 - TableScrollViewport — repeated accessibility contract.                                                                                                      
 - DataTableShell — repeated shell ownership contract.                                                                                                         
 - FormField / FieldError — consistent labels and invalid relationships.                                                                                       
 - DialogShell / DrawerShell — focus trap, Escape, focus return, pending and inert behavior.                                                                   
 - AsyncState family — loading, no data, no results, permission error, request failure.                                                                        
 - Responsive table metadata — critical/secondary column priority without hard-coding one strategy globally.                                                   
 - Layer policy — named sticky, popover, drawer, modal and toast levels.                                                                                       
                                                                                                                                                               
 These are justified consolidation boundaries, not a new UI library.                                                                                           
                                                                                                                                                               
 ────────────────────────────────────────────────────────────────────────────────                                                                              
                                                                                                                                                               
 17. IMPLEMENTATION ROADMAP                                                                                                                                    
                                                                                                                                                               
 ### Phase 0 — Safety and regression evidence                                                                                                                  
                                                                                                                                                               
 - Goal: Protect approved visuals before consolidation.                                                                                                        
 - Components/screens: Login, recovery, WorkspaceShell, classes, personnel, equipment catalog, Basic Medical registration, evidence.                           
 - Dependencies: Auth-capable test environment; representative viewport screenshots; axe checks.                                                               
 - Expected outcome: Reliable comparison baseline without modifying business logic.                                                                            
                                                                                                                                                               
 ### Phase 1 — Blocking accessibility and broken auth screens                                                                                                  
                                                                                                                                                               
 - Goal: Restore operability.                                                                                                                                  
 - Components/screens: Signature workflows, recovery/reset/change-password, modal focus handling.                                                              
 - Dependencies: Approved accessible signature alternative.                                                                                                    
 - Expected outcome: No inaccessible core confirmation; auth auxiliary screens match current MedLabs.                                                          
                                                                                                                                                               
 ### Phase 2 — Token and CSS consolidation                                                                                                                     
                                                                                                                                                               
 - Goal: Establish one effective semantic layer.                                                                                                               
 - Components/screens: globals.css, global controls, cards, statuses, typography.                                                                              
 - Dependencies: Phase 0 regression coverage.                                                                                                                  
 - Expected outcome: Same visual identity with fewer competing declarations.                                                                                   
                                                                                                                                                               
 ### Phase 3 — Shared structural primitives                                                                                                                    
                                                                                                                                                               
 - Goal: Enforce accessibility and shell ownership.                                                                                                            
 - Components/screens: Table viewport, form field, dialog/drawer, feedback, pagination view.                                                                   
 - Dependencies: Phase 2 tokens.                                                                                                                               
 - Expected outcome: Shared fixes propagate safely.                                                                                                            
                                                                                                                                                               
 ### Phase 4 — Shell and navigation                                                                                                                            
                                                                                                                                                               
 - Goal: Finish mobile and keyboard behavior.                                                                                                                  
 - Components/screens: Workspace sidebar, account/notification overlays, PageHeader actions.                                                                   
 - Dependencies: Shared overlay shell.                                                                                                                         
 - Expected outcome: Focus-contained, touch-usable navigation without visual redesign.                                                                         
                                                                                                                                                               
 ### Phase 5 — Pilot screen family                                                                                                                             
                                                                                                                                                               
 - Goal: Validate table, filters, actions, pagination and mobile priority.                                                                                     
 - Components/screens: /classes/open, /classes/mine, ClassRegistrationList, SearchableCombobox.                                                                
 - Dependencies: Phases 2–4.                                                                                                                                   
 - Expected outcome: Proven reusable implementation approach.                                                                                                  
                                                                                                                                                               
 ### Phase 6 — Tables and forms by operational priority                                                                                                        
                                                                                                                                                               
 - Goal: Apply appropriate mobile strategies.                                                                                                                  
 - Components/screens: Equipment requests, Basic Medical registrations/equipment, personnel, staff shifts, catalogs, import history.                           
 - Dependencies: Pilot results.                                                                                                                                
 - Expected outcome: Important workflows remain dense on desktop and operable on phone.                                                                        
                                                                                                                                                               
 ### Phase 7 — States and performance                                                                                                                          
                                                                                                                                                               
 - Goal: Improve perceived reliability.                                                                                                                        
 - Components/screens: Route loading/error boundaries, empty/error states, lifecycle history, personnel server loading.                                        
 - Dependencies: Stable primitives.                                                                                                                            
 - Expected outcome: Predictable feedback and lower latency.                                                                                                   
                                                                                                                                                               
 ### Phase 8 — Visual polish                                                                                                                                   
                                                                                                                                                               
 - Goal: Remove remaining typography, shadow, radius, pressed-state and layering drift.                                                                        
 - Dependencies: Functional and accessibility work complete.                                                                                                   
 - Expected outcome: Consistent professional finish without changing identity.                                                                                 
                                                                                                                                                               
 ────────────────────────────────────────────────────────────────────────────────                                                                              
                                                                                                                                                               
 18. RECOMMENDED FIRST PILOT                                                                                                                                   
                                                                                                                                                               
 - Screen/component: /classes/open and /classes/mine through ClassRegistrationList.                                                                            
 - Why:                                                                                                                                                        
   - One shared component serves two real routes.                                                                                                              
   - Representative filter toolbar, date range, combobox, export, table, pagination, feedback and destructive confirmation.                                    
   - High-frequency operational workflow.                                                                                                                      
   - Less business-risky than personnel or equipment lifecycle confirmation.                                                                                   
 - What it validates:                                                                                                                                          
   - Semantic tokens.                                                                                                                                          
   - Responsive toolbar.                                                                                                                                       
   - Table column priority.                                                                                                                                    
   - Focusable local scroll.                                                                                                                                   
   - Searchable combobox keyboard behavior.                                                                                                                    
   - Action hierarchy.                                                                                                                                         
   - Pagination presentation.                                                                                                                                  
   - Empty/feedback states.                                                                                                                                    
 - Blast radius: MEDIUM, with high learning value.                                                                                                             
                                                                                                                                                               
 Blocking auth/signature fixes should occur before or alongside pilot preparation; the pilot is the first design-system rollout target, not the first bug fix. 
                                                                                                                                                               
 ────────────────────────────────────────────────────────────────────────────────                                                                              
                                                                                                                                                               
 19. DO NOT CHANGE                                                                                                                                             
                                                                                                                                                               
 Explicitly preserve:                                                                                                                                          
                                                                                                                                                               
 - Be Vietnam Pro.                                                                                                                                             
 - EIU blue ■ #144069.
 - EIU gold ■ #A78656.
 - EIU cream/canvas direction.
 - Sidebar gradient.
 - White logo block.
 - Gold active-navigation accent.
 - Sidebar grouping and role-aware information architecture.
 - White sticky 82px desktop topbar.
 - Blue page-title hierarchy.
 - Current KPI card direction.
 - Dense desktop operational layouts.
 - Existing Calendar Master and responsive list default.
 - Current login visual identity.
 - Five-step import workflow.
 - Numbered form-section design.
 - Personnel table visual-shell reference.
 - Evidence document layout.
 - Existing status language.
 - Heroicons.
 - Tailwind CSS.
 - Next.js/React architecture.
 - Existing business, security and permission rules.

 Do not introduce another component library, font, palette or dashboard visual language.

 ────────────────────────────────────────────────────────────────────────────────

 20. AUDIT LIMITATIONS

 - Rendered screens inspected:
   - /login at approximately 375, 768, 1024 and 1440.
   - /forgot-password at 375 and 1440.
   - /reset-password at 375.
 - Screens blocked:
   - All authenticated routes redirected to /login.
 - Authentication/environment limitations:
   - No credentials were manufactured.
   - No environment or Supabase configuration was changed.
   - RENDERED UI INSPECTION PARTIALLY BLOCKED.
 - Measurements unavailable:
   - Protected-screen computed contrast.
   - Protected-screen actual overflow geometry.
   - Real authenticated focus order.
   - Live table widths with production-length data.
   - Runtime interaction latency outside public auth.
 - Architecture tooling:
   - GitNexus route mapping returned API architecture.
   - The broad GitNexus concept query was degraded because its FTS indexes are missing; no repair/re-index was performed.
   - Graphify’s graph file was absent; no graph was generated because re-indexing was prohibited.
 - Static findings for protected screens are grounded in source and CSS contracts, not claimed as rendered confirmation.

 ────────────────────────────────────────────────────────────────────────────────

 21. GIT SAFETY

 - Starting commit: aeb9a8302d20126afae116f82b613635b1a6f627
 - Ending commit: aeb9a8302d20126afae116f82b613635b1a6f627
 - Ending status: Clean.
 - Tracked source modified: No
 - Staged changes: None
 - git status --short: no output.
 - git diff --stat: no output.
 - git diff: no output.
 - git diff --cached: no output.
 - No configuration, index, source, package, lockfile, environment, database or migration changes were made.

 ────────────────────────────────────────────────────────────────────────────────

 22. VERDICT

 - UI needs major redesign: NO
 - UI needs design-system consolidation: YES
 - Mobile responsive requires significant work: YES
 - Existing visual identity should be preserved: YES
 - Ready to create implementation plan: YES     