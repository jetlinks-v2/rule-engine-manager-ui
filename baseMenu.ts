export default [
    {
        code: 'iot',
        name: '物联网',
        owner: 'iot',
        id: '9c21f88182e7cc75cbdfa8e4b7844272',
        url: '/iot',
        icon: 'icon-wulianwang',
        sortIndex: 1,
        permissions: [],
        children: [
            {
                code: 'rule-engine/Alarm',
                name: '告警中心',
                owner: 'iot',
                //parentId: '1',
                id: '3c7dca6ea8b5828bbcc023ce905244f7',
                sortIndex: 5,
                url: '/iot/Alarm',
                icon: 'icon-shebeigaojing',
                permissions: [],
                buttons: [],
                showPage: [],
                children: [
                    {
                        code: 'rule-engine/DashBoard',
                        name: '仪表盘',
                        owner: 'iot',
                        //parentId: '1-5',
                        id: 'f4d6880e3d8b3e3234c547fa84856b32',
                        sortIndex: 1,
                        url: '/iot/Alarm/dashboard',
                        icon: 'icon-keshihua',
                        showPage: ['dashboard', 'alarm-record', 'alarm-config'],
                        permissions: [
                            { permission: 'dashboard', actions: ['query'] },
                            { permission: 'alarm-config', actions: ['query'] },
                            { permission: 'alarm-record', actions: ['query'] },
                        ],
                        buttons: [],
                        accessSupport: { text: "不支持", value: "unsupported" },
                        supportDataAccess: false
                    },
                    {
                        code: 'rule-engine/Alarm/Config',
                        name: '基础配置',
                        owner: 'iot',
                        //parentId: '1-5',
                        id: 'af160284d1934bf052a2eeb9b9a9cb8f',
                        sortIndex: 2,
                        url: '/iot/Alarm/Config',
                        icon: 'icon-chajianguanli',
                        showPage: ['alarm-config'],
                        permissions: [],
                        buttons: [
                            {
                                id: 'update',
                                name: '保存',
                                permissions: [
                                    // { permission: 'alarm-record', actions: ['query', 'save'] },
                                    { permission: 'alarm-config', actions: ['query', 'save'] },
                                ],
                            },
                        ],
                        accessSupport: { text: "不支持", value: "unsupported" },
                        supportDataAccess: false
                    },
                    {
                        code: 'rule-engine/Alarm/Configuration',
                        name: '告警配置',
                        owner: 'iot',
                        //parentId: '1-5',
                        id: 'c5d3b1261f2f414dd04b0bf9194aa29e',
                        sortIndex: 3,
                        url: '/iot/Alarm/Configuration',
                        icon: 'icon-warning_amber',
                        showPage: ['alarm-config'],
                        permissions: [
                            {
                                permission: 'organization',
                                actions: ['query'],
                            },
                        ],
                        buttons: [
                            {
                                id: 'view',
                                name: '查看',
                                permissions: [
                                    {
                                        permission: 'alarm-config',
                                        actions: ['query'],
                                    },
                                    {
                                        permission: 'rule-scene',
                                        actions: ['query'],
                                    },
                                ],
                            },
                            {
                                id: 'add',
                                name: '新增',
                                permissions: [
                                    {
                                        permission: 'rule-scene',
                                        actions: ['query'],
                                    },
                                    {
                                        permission: 'alarm-config',
                                        actions: ['query', 'save'],
                                    },
                                    {
                                        permission: 'alarm-record',
                                        actions: ['query'],
                                    },
                                ],
                            },
                            {
                                id: 'action',
                                name: '启/禁用',
                                permissions: [
                                    {
                                        permission: 'alarm-config',
                                        actions: ['query', 'save'],
                                    },
                                    {
                                        permission: 'rule-scene',
                                        actions: ['query'],
                                    },
                                ],
                            },
                            {
                                id: 'delete',
                                name: '删除',
                                permissions: [
                                    {
                                        permission: 'alarm-config',
                                        actions: ['query', 'delete'],
                                    },
                                    {
                                        permission: 'rule-scene',
                                        actions: ['query'],
                                    },
                                ],
                            },
                            {
                                id: 'update',
                                name: '编辑',
                                permissions: [
                                    {
                                        permission: 'rule-scene',
                                        actions: ['query'],
                                    },
                                    {
                                        permission: 'alarm-record',
                                        actions: ['query'],
                                    },
                                    {
                                        permission: 'alarm-config',
                                        actions: ['query', 'save', 'delete'],
                                    },
                                ],
                            },
                            {
                                id: 'tigger',
                                name: '手动触发',
                                permissions: [
                                    {
                                        permission: 'alarm-config',
                                        actions: ['query'],
                                    },
                                    {
                                        permission: 'rule-scene',
                                        actions: ['query', 'save', 'execute'],
                                    },
                                ],
                            },
                        ],
                        accessSupport: { text: "支持", value: "support" },
                        supportDataAccess: true,
                        assetType: 'alarmConfig'
                    },
                    {
                        code: 'rule-engine/Alarm/Log',
                        name: '告警记录',
                        owner: 'iot',
                        //parentId: '1-5',
                        id: 'fca24d8d3276a410f7031a9b721017fd',
                        sortIndex: 4,
                        url: '/iot/Alarm/Log',
                        icon: 'icon-changjingliandong',
                        showPage: ['alarm-record'],
                        permissions: [],
                        buttons: [
                            {
                                id: 'view',
                                name: '查看',
                                permissions: [
                                    {
                                        permission: 'alarm-record',
                                        actions: ['query'],
                                    },
                                    {
                                        permission: 'organization',
                                        actions: ['query'],
                                    },
                                    {
                                        permission: 'alarm-config',
                                        actions: ['query'],
                                    },
                                ],
                            },
                            {
                                id: 'action',
                                name: '告警处理',
                                permissions: [
                                    {
                                        permission: 'alarm-record',
                                        actions: ['query', 'save'],
                                    },
                                    {
                                        permission: 'organization',
                                        actions: ['query'],
                                    },
                                    {
                                        permission: 'alarm-config',
                                        actions: ['query'],
                                    },
                                ],
                            },
                        ],
                        accessSupport: { text: "间接支持", value: "indirect" },
                        supportDataAccess: false
                    },
                ],
            },
            {
                code: 'rule-engine',
                name: '规则引擎',
                owner: 'iot',
                //parentId: '1',
                id: '91aa7c753b1c030dfad612aa0a45d453',
                sortIndex: 7,
                url: '/iot/rule-engine',
                icon: 'icon-zidingyiguize',
                permissions: [],
                buttons: [],
                children: [
                    {
                        code: 'rule-engine/Instance',
                        name: '规则编排',
                        owner: 'iot',
                        //parentId: '1-7',
                        id: '898001f2efa11f93253d67a254904ead',
                        sortIndex: 1,
                        url: '/iot/rule-engine/Instance',
                        icon: 'icon-changjingliandong',
                        showPage: ['rule-instance'],
                        permissions: [],
                        buttons: [
                            {
                                id: 'view',
                                name: '查看',
                                permissions: [
                                    {
                                        permission: 'template',
                                        actions: ['query'],
                                    },
                                    {
                                        permission: 'network-config',
                                        actions: ['query'],
                                    },
                                    {
                                        permission: 'rule-instance',
                                        actions: ['query'],
                                    },
                                    {
                                        permission: 'notifier',
                                        actions: ['query'],
                                    },
                                    {
                                        permission: 'datasource-config',
                                        actions: ['query'],
                                    },
                                ],
                            },
                            {
                                id: 'action',
                                name: '启/禁用',
                                permissions: [
                                    {
                                        permission: 'template',
                                        actions: ['query'],
                                    },
                                    {
                                        permission: 'network-config',
                                        actions: ['query'],
                                    },
                                    {
                                        permission: 'rule-instance',
                                        actions: ['stop', 'query', 'start', 'save', 'execute'],
                                    },
                                    {
                                        permission: 'notifier',
                                        actions: ['query'],
                                    },
                                    {
                                        permission: 'datasource-config',
                                        actions: ['query'],
                                    },
                                ],
                            },
                            {
                                id: 'delete',
                                name: '删除',
                                permissions: [
                                    {
                                        permission: 'template',
                                        actions: ['query'],
                                    },
                                    {
                                        permission: 'network-config',
                                        actions: ['query'],
                                    },
                                    {
                                        permission: 'rule-instance',
                                        actions: ['query', 'delete'],
                                    },
                                    {
                                        permission: 'notifier',
                                        actions: ['query'],
                                    },
                                    {
                                        permission: 'datasource-config',
                                        actions: ['query'],
                                    },
                                ],
                            },
                            {
                                id: 'update',
                                name: '编辑',
                                permissions: [
                                    {
                                        permission: 'template',
                                        actions: ['query'],
                                    },
                                    {
                                        permission: 'network-config',
                                        actions: ['query'],
                                    },
                                    {
                                        permission: 'rule-instance',
                                        actions: ['query', 'save', 'execute'],
                                    },
                                    {
                                        permission: 'notifier',
                                        actions: ['query'],
                                    },
                                    {
                                        permission: 'datasource-config',
                                        actions: ['query'],
                                    },
                                ],
                            },
                            {
                                id: 'add',
                                name: '新增',
                                permissions: [
                                    {
                                        permission: 'template',
                                        actions: ['query'],
                                    },
                                    {
                                        permission: 'network-config',
                                        actions: ['query'],
                                    },
                                    {
                                        permission: 'rule-instance',
                                        actions: ['query', 'save', 'execute'],
                                    },
                                    {
                                        permission: 'notifier',
                                        actions: ['query'],
                                    },
                                    {
                                        permission: 'datasource-config',
                                        actions: ['query'],
                                    },
                                ],
                            },
                        ],
                        accessSupport: { text: "支持", value: "support" },
                        supportDataAccess: true,
                        assetType: 'ruleInstance'
                    },
                    {
                        code: 'rule-engine/Scene',
                        name: '场景联动',
                        owner: 'iot',
                        //parentId: '1-7',
                        id: 'b68867fdc24cfc3df7c52e842136f439',
                        sortIndex: 2,
                        url: '/iot/rule-engine/scene',
                        icon: 'icon-yunweiguanli-1',
                        showPage: ['rule-scene'],
                        permissions: [],
                        buttons: [
                            {
                                id: 'delete',
                                name: '删除',
                                permissions: [
                                    {
                                        permission: 'rule-scene',
                                        actions: ['query', 'delete'],
                                    },
                                    // {
                                    //   permission: 'alarm-config',
                                    //   actions: ['query'],
                                    // },
                                ],
                            },
                            {
                                id: 'tigger',
                                name: '手动触发',
                                permissions: [
                                    {
                                        permission: 'rule-scene',
                                        actions: ['query', 'save', 'execute'],
                                    },
                                ],
                            },
                            {
                                id: 'view',
                                name: '查看',
                                permissions: [
                                    {
                                        permission: 'user',
                                        actions: ['query'],
                                    },
                                    {
                                        permission: 'device-product',
                                        actions: ['query'],
                                    },
                                    {
                                        permission: 'template',
                                        actions: ['query'],
                                    },
                                    {
                                        permission: 'rule-scene',
                                        actions: ['query'],
                                    },
                                    {
                                        permission: 'relation',
                                        actions: ['query'],
                                    },
                                    {
                                        permission: 'notifier',
                                        actions: ['query'],
                                    },
                                    {
                                        permission: 'device-instance',
                                        actions: ['query'],
                                    },
                                ],
                            },
                            {
                                id: 'action',
                                name: '启用/禁用',
                                permissions: [
                                    {
                                        permission: 'rule-scene',
                                        actions: ['query', 'save', 'execute'],
                                    },
                                ],
                            },
                            {
                                id: 'add',
                                name: '新增',
                                permissions: [
                                    {
                                        permission: 'user',
                                        actions: ['query'],
                                    },
                                    {
                                        permission: 'device-product',
                                        actions: ['query'],
                                    },
                                    {
                                        permission: 'template',
                                        actions: ['query'],
                                    },
                                    {
                                        permission: 'device-instance',
                                        actions: ['query'],
                                    },
                                    {
                                        permission: 'rule-scene',
                                        actions: ['query', 'save', 'execute'],
                                    },
                                    {
                                        permission: 'notifier',
                                        actions: ['query'],
                                    },
                                    {
                                        permission: 'relation',
                                        actions: ['query'],
                                    },
                                ],
                            },
                            {
                                id: 'update',
                                name: '编辑',
                                permissions: [
                                    {
                                        permission: 'user',
                                        actions: ['query'],
                                    },
                                    {
                                        permission: 'device-product',
                                        actions: ['query'],
                                    },
                                    {
                                        permission: 'template',
                                        actions: ['query'],
                                    },
                                    {
                                        permission: 'device-instance',
                                        actions: ['query'],
                                    },
                                    {
                                        permission: 'rule-scene',
                                        actions: ['query', 'save', 'execute'],
                                    },
                                    {
                                        permission: 'notifier',
                                        actions: ['query'],
                                    },
                                    {
                                        permission: 'relation',
                                        actions: ['query'],
                                    },
                                ],
                            },
                        ],
                        accessSupport: { text: "支持", value: "support" },
                        supportDataAccess: true,
                        assetType: 'scene'
                    },
                ],
            },
        ],
    },
]
